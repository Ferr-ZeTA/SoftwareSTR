import { Router } from 'express'
import { Request, LOCAL_STATUS } from '../models/Request.js'
import { ROLES } from '../models/User.js'
import { authenticate, enforceScope, requireRole } from '../middleware/auth.js'
import { issueApprovalToken, consumeApprovalToken, revertDecision } from '../services/approvalService.js'
import { sendApprovalEmail, escapeHtml } from '../services/mailer.js'
import { syncExternalApi, upsertRequest } from '../services/syncExternalApi.js'

export const requestsRouter = Router()
const demoMode = process.env.DEMO_MODE !== 'false'

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

function revertPage({ documento, status, token, seconds }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Respuesta registrada</title>
<style>
 body{font-family:Arial,Helvetica,sans-serif;background:#f5f8fa;margin:0;color:#19283b}
 .card{max-width:520px;margin:70px auto;background:#fff;padding:40px;border-radius:14px;
   border:1px solid #e5ebef;text-align:center;box-shadow:0 10px 40px rgba(17,37,61,.08)}
 .mark{width:64px;height:64px;margin:auto;border-radius:50%;display:grid;place-items:center;
   font-size:32px;background:#e1f6f0;color:#168d77}
 h1{margin:18px 0 8px;font-size:22px}
 p{color:#526276;margin:6px 0;line-height:1.5}
 .undo{margin-top:26px;padding:18px;border-radius:11px;background:#f8fafc;border:1px solid #e5ebef}
 .undo strong{display:block;font-size:15px;margin-bottom:4px}
 .count{font-size:30px;font-weight:bold;color:#11253d;margin:10px 0;font-variant-numeric:tabular-nums}
 .bar{height:5px;background:#e5ebef;border-radius:99px;overflow:hidden;margin:12px 0 18px}
 .bar i{display:block;height:100%;background:#0d9488;width:100%;
   animation:drain ${seconds}s linear forwards}
 @keyframes drain{to{width:0}}
 .btns{display:flex;gap:10px;justify-content:center}
 button,a.btn{font:inherit;font-size:14px;font-weight:bold;padding:12px 26px;border-radius:9px;
   border:1px solid transparent;cursor:pointer;text-decoration:none;display:inline-block}
 .yes{background:#fcecef;color:#c0525e;border-color:#f6cdd5}
 .yes:hover{background:#c0525e;color:#fff}
 .no{background:#fff;color:#526276;border-color:#dde5ed}
 .no:hover{background:#eef3f8}
 .done{color:#9aa8b6;font-size:13px;margin-top:22px}
</style></head><body>
<div class="card">
 <div class="mark">&#10003;</div>
 <h1>Respuesta registrada</h1>
 <p>El traslado <strong>${escapeHtml(documento)}</strong> quedó como <strong>${escapeHtml(status)}</strong>.</p>

 <div class="undo" id="undo">
  <strong>Tienes <span id="s">${seconds}</span> segundos para revertir la decisión.</strong>
  <p>¿Deseas revertirla?</p>
  <div class="bar"><i></i></div>
  <div class="count" id="c">${seconds}</div>
  <div class="btns">
   <a class="btn yes" href="/api/requests/revert?token=${encodeURIComponent(token)}">Sí, revertir</a>
   <button class="no" id="keep">No, dejarla así</button>
  </div>
 </div>
 <p class="done" id="msg" style="display:none">Decisión confirmada. Puedes cerrar esta ventana.</p>
</div>
<script>
 var left = ${seconds};
 var c = document.getElementById('c'), s = document.getElementById('s');
 var undo = document.getElementById('undo'), msg = document.getElementById('msg');
 function finish(){ undo.style.display = 'none'; msg.style.display = 'block'; }
 var timer = setInterval(function(){
   left--; c.textContent = left; s.textContent = left;
   if (left <= 0) { clearInterval(timer); finish(); }
 }, 1000);
 document.getElementById('keep').addEventListener('click', function(){
   clearInterval(timer); finish();
 });
</script>
</body></html>`
}

// --- PUBLICO: revertir la decision dentro de la ventana. ---
requestsRouter.get('/revert', async (request, response) => {
  response.type('html')
  const result = await revertDecision(String(request.query.token || ''))

  if (result.ok) {
    return response.status(200).send(resultPage(
      true,
      'Decisión revertida',
      `El traslado <strong>${escapeHtml(result.request.documento)}</strong> volvió a `
      + `<strong>${escapeHtml(result.restoredTo)}</strong>.`,
    ))
  }

  const messages = {
    used: 'Esta reversión ya se usó una vez.',
    expired: 'Se acabó el tiempo para revertir. La decisión quedó registrada.',
    unknown: 'El enlace de reversión no es válido.',
    invalid: 'El enlace de reversión está incompleto.',
  }
  return response.status(result.reason === 'expired' ? 410 : 400)
    .send(resultPage(false, 'No se pudo revertir', messages[result.reason]))
})

// --- PUBLICO: aprobacion por correo. Debe declararse antes de /:externalId. ---
requestsRouter.get('/approve', async (request, response) => {
  const { token, status } = request.query
  response.type('html')

  const result = await consumeApprovalToken(String(token || ''), String(status || ''))
  if (result.ok) {
    return response.status(200).send(revertPage({
      documento: result.request.documento,
      status: result.request.localStatus,
      token: result.revertToken,
      seconds: result.revertSeconds,
    }))
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

requestsRouter.post('/demo/send-approval', async (request, response) => {
  if (!demoMode) return response.status(404).json({ error: 'Modo demo desactivado.' })

  const demo = request.body?.request
  if (!demo?.id || !['GT', 'SV'].includes(demo.pais)) {
    return response.status(400).json({ error: 'La solicitud demo no es válida.' })
  }

  const saved = await upsertRequest([{
    documento: demo.documento,
    fecha: demo.fechaISO,
    cliente: demo.clienteCodigo,
    nombre: demo.cliente,
    bodegaorigen: demo.bodegaOrigen,
    bodegadestino: demo.bodegaDestino,
    tiposolicitud: demo.tipoSolicitud,
    modelo: demo.items?.[0]?.modelo,
    descripcion: demo.items?.[0]?.descripcion,
    cantidad: demo.items?.[0]?.cantidad,
  }], demo.pais)
  if (!saved) return response.status(400).json({ error: 'No se pudo preparar la solicitud demo.' })

  const issued = await issueApprovalToken(saved.externalId, process.env.BREVO_EDUARDO_EMAIL)
  if (!issued) return response.status(404).json({ error: 'Solicitud demo no encontrada.' })

  try {
    const sent = await sendApprovalEmail({
      request: issued.request,
      token: issued.token,
      additionalInfo: request.body?.additionalInfo,
    })
    return response.json({ ...sent, expiresAt: issued.expiresAt })
  } catch (error) {
    return response.status(502).json({ error: error.message })
  }
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
