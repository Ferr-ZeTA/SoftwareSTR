import { Router } from 'express'
import { Request, LOCAL_STATUS } from '../models/Request.js'
import { ROLES } from '../models/User.js'
import { authenticate, enforceScope, requireRole } from '../middleware/auth.js'
import { issueApprovalToken, consumeApprovalToken } from '../services/approvalService.js'
import { sendApprovalEmail, escapeHtml } from '../services/mailer.js'
import { syncExternalApi } from '../services/syncExternalApi.js'

export const requestsRouter = Router()

const LIST_PROJECTION = '-raw -approvalTokenHash'

function resultPage(ok, title, message) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="font-family:Arial,sans-serif;background:#f5f8fa;margin:0">
<div style="max-width:520px;margin:80px auto;text-align:center;color:#19283b;background:white;padding:40px;border-radius:12px;border:1px solid #e5ebef">
<div style="width:64px;height:64px;margin:auto;background:${ok ? '#e1f6f0' : '#fcecef'};border-radius:50%;display:grid;place-items:center;color:${ok ? '#168d77' : '#c0525e'};font-size:32px">${ok ? '&#10003;' : '!'}</div>
<h1 style="margin-bottom:8px">${escapeHtml(title)}</h1>
<p style="color:#526276">${message}</p>
<p style="color:#9aa8b6;font-size:13px">Puedes cerrar esta ventana.</p>
</div></body></html>`
}

// --- PUBLICO: aprobacion por correo. Debe declararse antes de /:externalId. ---
requestsRouter.get('/approve', async (request, response) => {
  const { token, status } = request.query
  response.type('html')

  const result = await consumeApprovalToken(String(token || ''), String(status || ''))
  if (result.ok) {
    return response.status(200).send(resultPage(
      true,
      'Respuesta registrada',
      `El traslado <strong>${escapeHtml(result.request.documento)}</strong> quedo como <strong>${escapeHtml(result.request.localStatus)}</strong>.`,
    ))
  }

  const messages = {
    used: 'Este enlace ya fue utilizado. Cada enlace sirve una sola vez.',
    expired: 'Este enlace expiro. Solicita que se reenvie la aprobacion.',
    unknown: 'El enlace de aprobacion no es valido.',
    invalid: 'El enlace de aprobacion esta incompleto o la respuesta no es valida.',
  }
  return response.status(result.reason === 'used' ? 409 : 400)
    .send(resultPage(false, 'Enlace no valido', messages[result.reason]))
})

// --- A partir de aqui todo exige JWT y queda acotado por pais. ---
requestsRouter.use(authenticate, enforceScope)

// Sincronizacion manual. Va antes de /:externalId para no colisionar.
requestsRouter.post('/sync', requireRole(ROLES.GERENTE_GENERAL), async (request, response) => {
  const countries = Array.isArray(request.body?.countries) ? request.body.countries : undefined
  const summary = await syncExternalApi({ countries })
  response.status(summary.errors.length ? 207 : 200).json(summary)
})

requestsRouter.get('/', async (request, response) => {
  const { status, country, tipo, search, from, to } = request.query
  const page = Math.max(1, Number(request.query.page) || 1)
  const limit = Math.min(200, Math.max(1, Number(request.query.limit) || 50))

  const filter = { deletedLocally: false }
  if (status) filter.localStatus = String(status)
  if (tipo) filter.tipoSolicitud = String(tipo)
  if (country) filter.country = String(country)
  if (from || to) {
    filter.fecha = {}
    if (from) filter.fecha.$gte = new Date(String(from))
    if (to) filter.fecha.$lte = new Date(String(to))
  }
  if (search) {
    const term = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    filter.$or = [
      { documento: term }, { clienteNombre: term },
      { clienteCodigo: term }, { 'items.descripcion': term },
    ]
  }
  // El scope se aplica al final: un ?country= del cliente no puede sacar
  // a un GERENTE_REGIONAL de su pais.
  Object.assign(filter, request.scope)

  const [data, total] = await Promise.all([
    Request.find(filter).select(LIST_PROJECTION)
      .sort({ fecha: -1, documento: -1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    Request.countDocuments(filter),
  ])

  response.json({ data, total, page, limit, pages: Math.ceil(total / limit) })
})

requestsRouter.get('/:externalId', async (request, response) => {
  const found = await Request.findOne({
    externalId: request.params.externalId,
    deletedLocally: false,
    ...request.scope,
  }).select('-approvalTokenHash').lean()
  if (!found) return response.status(404).json({ error: 'Solicitud no encontrada.' })
  response.json(found)
})

// Solo campos locales: la API externa sigue siendo la duena del resto.
requestsRouter.patch('/:externalId', async (request, response) => {
  const filter = { externalId: request.params.externalId, deletedLocally: false, ...request.scope }
  const current = await Request.findOne(filter).select('localStatus').lean()
  if (!current) return response.status(404).json({ error: 'Solicitud no encontrada.' })

  const update = {}
  const push = {}
  if (request.body?.localStatus !== undefined) {
    if (!Object.values(LOCAL_STATUS).includes(request.body.localStatus)) {
      return response.status(400).json({ error: 'localStatus invalido.' })
    }
    update.localStatus = request.body.localStatus
    // Quien decide y por donde queda registrado para la auditoria.
    if (request.body.localStatus !== current.localStatus) {
      const now = new Date()
      update.approvalDecidedAt = now
      update.approvalDecidedBy = request.user.email
      update.approvalDecidedVia = 'dashboard'
      push.approvalHistory = {
        status: request.body.localStatus,
        previousStatus: current.localStatus,
        by: request.user.email,
        via: 'dashboard',
        at: now,
        note: 'Cambio manual desde el panel.',
      }
    }
  }
  if (request.body?.internalNotes !== undefined) {
    update.internalNotes = String(request.body.internalNotes).slice(0, 5000)
  }
  if (!Object.keys(update).length) {
    return response.status(400).json({ error: 'Nada que actualizar.' })
  }

  const mutation = { $set: update }
  if (push.approvalHistory) mutation.$push = push

  const updated = await Request.findOneAndUpdate(filter, mutation, {
    returnDocument: 'after',
  }).select(LIST_PROJECTION)
  if (!updated) return response.status(404).json({ error: 'Solicitud no encontrada.' })
  response.json(updated)
})

// Borrado local (bandera). El registro sobrevive a la siguiente sincronizacion.
requestsRouter.delete('/:externalId', async (request, response) => {
  const updated = await Request.findOneAndUpdate(
    { externalId: request.params.externalId, ...request.scope },
    { $set: { deletedLocally: true } },
    { returnDocument: 'after' },
  ).select('externalId deletedLocally')
  if (!updated) return response.status(404).json({ error: 'Solicitud no encontrada.' })
  response.json(updated)
})

requestsRouter.post('/:externalId/restore', async (request, response) => {
  const updated = await Request.findOneAndUpdate(
    { externalId: request.params.externalId, ...request.scope },
    { $set: { deletedLocally: false } },
    { returnDocument: 'after' },
  ).select('externalId deletedLocally')
  if (!updated) return response.status(404).json({ error: 'Solicitud no encontrada.' })
  response.json(updated)
})

requestsRouter.post('/:externalId/send-approval', async (request, response) => {
  const target = await Request.findOne({
    externalId: request.params.externalId,
    deletedLocally: false,
    ...request.scope,
  }).select('externalId')
  if (!target) return response.status(404).json({ error: 'Solicitud no encontrada.' })

  const issued = await issueApprovalToken(target.externalId, process.env.BREVO_EDUARDO_EMAIL)
  if (!issued) return response.status(404).json({ error: 'Solicitud no encontrada.' })

  try {
    const sent = await sendApprovalEmail({
      request: issued.request,
      token: issued.token,
      additionalInfo: request.body?.additionalInfo,
    })
    response.json({ ...sent, expiresAt: issued.expiresAt })
  } catch (error) {
    response.status(502).json({ error: error.message })
  }
})
