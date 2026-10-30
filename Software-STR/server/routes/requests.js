import { Router } from 'express'
import { Request, LOCAL_DEFAULTS, LOCAL_STATUS, SAP_PUSH_STATUS } from '../models/Request.js'
import { ROLES } from '../models/User.js'
import { authenticate, enforceScope, requireRole } from '../middleware/auth.js'
import {
  issueApprovalToken, invalidateApprovalToken, consumeApprovalToken, peekApprovalToken,
  REVERT_WINDOW_SECONDS,
} from '../services/approvalService.js'
import {
  sendApprovalEmail, getBrevoConfigError, escapeHtml,
} from '../services/mailer.js'
import {
  getExternalRequest, getExternalRequests, MIN_DATE, syncExternalApi,
} from '../services/syncExternalApi.js'
import { authorizeInSap } from '../services/sapApproval.js'

export const requestsRouter = Router()

const LOCAL_PROJECTION = '-approvalTokenHash'

function combineRequest(external, local) {
  const state = local?.toObject ? local.toObject() : local
  const combined = { ...external, ...LOCAL_DEFAULTS, ...(state || {}) }
  delete combined.approvalTokenHash
  return combined
}

async function ensureLocalState(external) {
  return Request.findOneAndUpdate(
    { externalId: external.externalId },
    { $setOnInsert: { ...LOCAL_DEFAULTS, externalId: external.externalId, country: external.country } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  )
}

// Motivos por los que un enlace del correo deja de servir.
const LINK_ERRORS = {
  used: 'Este enlace ya fue utilizado. Cada enlace sirve una sola vez.',
  expired: 'Este enlace expiro. Solicita que se reenvie la aprobacion.',
  decided: 'Esta solicitud ya fue decidida desde el panel.',
  unknown: 'El enlace de aprobacion no es valido.',
  invalid: 'El enlace de aprobacion esta incompleto o la respuesta no es valida.',
}

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

// Pagina que abre el enlace del correo: muestra la solicitud, permite
// cancelar durante la cuenta regresiva y luego pide solo la justificacion.
function approvalGatePage({ request, status, token, seconds, error, motivo = '' }) {
  const aprueba = status === 'Aprobada'
  const color = aprueba ? '#0d9488' : '#be123c'
  const filas = (request.items || []).map((item) => `
    <tr>
      <td>${escapeHtml(item.modelo)}</td>
      <td>${escapeHtml(item.descripcion)}</td>
      <td style="text-align:right">${item.cantidad}</td>
    </tr>`).join('')

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${aprueba ? 'Aprobar' : 'Rechazar'} traslado ${escapeHtml(request.documento)}</title>
<style>
 *{box-sizing:border-box}
 body{font-family:Arial,Helvetica,sans-serif;background:#f4f7fa;margin:0;color:#19283b;
   padding:24px;display:flex;justify-content:center}
 .card{width:100%;max-width:560px;background:#fff;border:1px solid #e4ebf2;border-radius:16px;
   box-shadow:0 10px 40px rgba(17,37,61,.09);overflow:hidden}
 .head{background:#11253d;color:#fff;padding:22px 28px}
 .head .brand{font-size:17px;font-weight:bold}
 .head .brand span{color:#54c9b8}
 .head .sub{font-size:12px;color:#b6c5d4;margin-top:4px}
 .body{padding:28px}
 h1{font-size:20px;margin:0 0 6px}
 .lead{color:#526276;font-size:14px;line-height:1.55;margin:0 0 20px}
 .pill{display:inline-block;padding:5px 13px;border-radius:99px;font-size:12.5px;
   font-weight:bold;color:#fff;background:${color}}
 .meta{background:#f8fafc;border:1px solid #e4ebf2;border-radius:10px;padding:15px;margin:18px 0}
 .meta p{margin:4px 0;font-size:13.5px}
 table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:10px}
 th{text-align:left;color:#64748b;font-size:10.5px;text-transform:uppercase;
   letter-spacing:.05em;padding:6px 8px;border-bottom:1px solid #e4ebf2}
 td{padding:6px 8px;border-bottom:1px solid #eef3f8}
 .count{text-align:center;padding:22px;border:1px dashed #cbd5e1;border-radius:12px;background:#f8fafc}
 .count .num{font-size:38px;font-weight:bold;color:#11253d;font-variant-numeric:tabular-nums}
 .count p{color:#526276;font-size:13.5px;margin:6px 0 0}
 .bar{height:5px;background:#e4ebf2;border-radius:99px;overflow:hidden;margin-top:14px}
 .bar i{display:block;height:100%;background:${color};width:100%;
   animation:drain ${seconds}s linear forwards}
 @keyframes drain{to{width:0}}
 label{display:block;font-size:12.5px;font-weight:bold;margin:14px 0 6px}
 input{width:100%;padding:11px 13px;border:1px solid #cbd5e1;border-radius:9px;
   font-size:14px;font-family:inherit}
 input:focus{outline:2px solid ${color};outline-offset:1px;border-color:${color}}
 .hint{font-size:12px;color:#64748b;margin-top:7px;line-height:1.5}
 .row{display:flex;gap:10px;margin-top:22px}
 button{flex:1;padding:13px;border-radius:9px;font-size:14px;font-weight:bold;
   cursor:pointer;font-family:inherit;border:1px solid transparent}
 .go{background:${color};color:#fff}
 .cancel{background:#fff;border-color:#cbd5e1;color:#526276}
 .err{background:#fdeaef;border:1px solid #f6c6d2;color:#be123c;padding:12px 14px;
   border-radius:9px;font-size:13px;margin-bottom:16px}
 .hidden{display:none}
 textarea{width:100%;padding:11px 13px;border:1px solid #cbd5e1;border-radius:9px;
   font-size:14px;font-family:inherit;resize:vertical}
 textarea:focus{outline:2px solid ${color};outline-offset:1px;border-color:${color}}
 label em{font-weight:normal;color:#94a3b8;font-style:normal}
</style></head>
<body><div class="card">
 <div class="head">
   <div class="brand">STR<span>flow</span></div>
   <div class="sub">Confirmación de ${aprueba ? 'aprobación' : 'rechazo'}</div>
 </div>
 <div class="body">
   ${error ? `<div class="err">${escapeHtml(error)}</div>` : ''}

   <h1>Traslado ${escapeHtml(request.documento)}</h1>
   <p class="lead">Estás por marcarlo como <span class="pill">${escapeHtml(status)}</span></p>

   <div class="meta">
     <p><strong>Cliente:</strong> ${escapeHtml(request.clienteNombre)} (${escapeHtml(request.clienteCodigo)})</p>
     <p><strong>Ruta:</strong> ${escapeHtml(request.bodegaOrigen)} &rarr; ${escapeHtml(request.bodegaDestino)}</p>
     <p><strong>País:</strong> ${escapeHtml(request.country)} · <strong>Tipo:</strong> ${escapeHtml(request.tipoSolicitud)}</p>
     <table>
       <thead><tr><th>Modelo</th><th>Descripción</th><th style="text-align:right">Cant.</th></tr></thead>
       <tbody>${filas}</tbody>
     </table>
   </div>

   <div id="espera" class="count${error ? ' hidden' : ''}">
     <div class="num" id="num">${seconds}</div>
     <p>Revisá el detalle. Si te equivocaste de botón, podés cancelar.</p>
     <div class="bar"><i></i></div>
     <div class="row"><button type="button" class="cancel" onclick="location.href='/api/requests/approve/cancel'">Cancelar</button></div>
   </div>

   <form id="form" class="${error ? '' : 'hidden'}" method="POST" action="/api/requests/approve/confirm" autocomplete="off">
     <input type="hidden" name="token" value="${escapeHtml(token)}">
     <input type="hidden" name="status" value="${escapeHtml(status)}">
     <label for="motivo">Justificación ${aprueba ? '<em>(opcional)</em>' : ''}</label>
     <textarea id="motivo" name="motivo" rows="4" ${aprueba ? '' : 'required'}
       placeholder="${aprueba ? 'Por ejemplo: stock confirmado con bodega.' : 'Explicá por qué no se aprueba.'}">${escapeHtml(motivo)}</textarea>
     <p class="hint">Quedará guardada en el historial del traslado junto con la fecha.</p>
     <div class="row">
       <button type="button" class="cancel" onclick="location.href='/api/requests/approve/cancel'">Cancelar</button>
       <button type="submit" class="go">Confirmar ${aprueba ? 'aprobación' : 'rechazo'}</button>
     </div>
   </form>
 </div>
</div>
<script>
 // La espera es para arrepentirse; el formulario aparece recien al terminar.
 // En un reintento ya se espero una vez, asi que no se repite.
 var reintento = ${error ? 'true' : 'false'};
 var restante = ${seconds};
 if (reintento) { document.getElementById('motivo').focus(); }
 var num = document.getElementById('num');
 var reloj = reintento ? null : setInterval(function () {
   restante -= 1;
   if (restante > 0) { num.textContent = restante; return; }
   clearInterval(reloj);
   document.getElementById('espera').classList.add('hidden');
   document.getElementById('form').classList.remove('hidden');
   document.getElementById('motivo').focus();
 }, 1000);
</script>
</body></html>`
}

// --- PUBLICO: aprobacion por correo. Debe declararse antes de /:externalId. ---
requestsRouter.get('/approve', async (request, response) => {
  const token = String(request.query.token || '')
  const status = String(request.query.status || '')
  response.type('html')

  if (!Object.values(LOCAL_STATUS).includes(status)) {
    return response.status(400).send(resultPage(false, 'Enlace no valido', LINK_ERRORS.invalid))
  }

  const result = await peekApprovalToken(token)
  if (!result?.ok) {
    const reason = result?.reason || 'unknown'
    return response.status(reason === 'used' ? 409 : 400)
      .send(resultPage(false, 'Enlace no valido', LINK_ERRORS[reason]))
  }

  const external = await getExternalRequest(result.request.externalId)
  if (!external) {
    return response.status(404).send(resultPage(false, 'Solicitud no disponible', 'Ya no aparece en la API externa.'))
  }
  return response.send(approvalGatePage({
    request: combineRequest(external, result.request),
    status,
    token,
    seconds: REVERT_WINDOW_SECONDS,
  }))
})

// Aqui si se registra la decision: primero en SAP, y solo si SAP la acepta se
// gasta el token. Si SAP no esta configurado, la decision queda simulada.
requestsRouter.post('/approve/confirm', async (request, response) => {
  const { token = '', status = '', motivo = '' } = request.body || {}
  response.type('html')

  if (!Object.values(LOCAL_STATUS).includes(status)) {
    return response.status(400).send(resultPage(false, 'Enlace no valido', LINK_ERRORS.invalid))
  }

  const peeked = await peekApprovalToken(token)
  if (!peeked?.ok) {
    const reason = peeked?.reason || 'unknown'
    return response.status(reason === 'used' ? 409 : 400)
      .send(resultPage(false, 'Enlace no valido', LINK_ERRORS[reason]))
  }

  const external = await getExternalRequest(peeked.request.externalId)
  if (!external) {
    return response.status(404).send(resultPage(false, 'Solicitud no disponible', 'Ya no aparece en la API externa.'))
  }
  const approvalRequest = combineRequest(external, peeked.request)
  if (status === LOCAL_STATUS.NO_APROBADA && !String(motivo).trim()) {
    return response.status(400).send(approvalGatePage({
      request: approvalRequest,
      status,
      token,
      seconds: REVERT_WINDOW_SECONDS,
      error: 'Escribe una justificación para rechazar la solicitud.',
    }))
  }
  const sap = await authorizeInSap({
    request: approvalRequest, status, motivo,
  })

  if (!sap.ok) {
    // Se devuelve el formulario con la justificacion. El token sigue sirviendo.
    return response.status(sap.retryable ? 400 : 502).send(approvalGatePage({
      request: approvalRequest, status, token, seconds: REVERT_WINDOW_SECONDS,
      error: sap.message, motivo,
    }))
  }

  const constancia = {
    status: SAP_PUSH_STATUS.ENVIADO, code: sap.code, error: null, user: null, motivo,
  }
  const result = await consumeApprovalToken(token, status, constancia)

  if (!result?.ok) {
    const reason = result?.reason || 'unknown'
    return response.status(reason === 'used' ? 409 : 400)
      .send(resultPage(false, 'Enlace no valido', LINK_ERRORS[reason]))
  }

  return response.send(resultPage(
    true,
    status === LOCAL_STATUS.APROBADA ? 'Traslado aprobado' : 'Traslado rechazado',
    `El traslado <strong>${escapeHtml(external.documento)}</strong> quedo como `
    + `<strong>${escapeHtml(status)}</strong>. ${escapeHtml(sap.message)}`,
  ))
})

requestsRouter.get('/approve/cancel', (request, response) => {
  response.type('html').send(resultPage(
    true,
    'No se registro nada',
    'Cancelaste a tiempo: el traslado sigue pendiente. '
    + 'Podes volver al correo y elegir de nuevo cuando quieras.',
  ))
})

// --- A partir de aqui todo exige JWT y queda acotado por pais. ---
requestsRouter.use(authenticate, enforceScope)

// Sincronizacion manual. Va antes de /:externalId para no colisionar.
requestsRouter.post('/sync', requireRole(ROLES.GERENTE_GENERAL), async (request, response) => {
  const countries = Array.isArray(request.body?.countries) ? request.body.countries : undefined
  if (countries && countries.some((country) => !['GT', 'SV'].includes(country))) {
    return response.status(400).json({ error: 'El país debe ser GT o SV.' })
  }
  const summary = await syncExternalApi({ countries, force: true })
  if (summary.errors.length) return response.status(502).json({ error: summary.errors.map((item) => item.message).join('; ') })
  response.json({
    rows: summary.rows,
    documents: summary.documents,
    skippedByDate: summary.skippedByDate,
    minDate: summary.minDate,
    durationMs: summary.durationMs,
  })
})

requestsRouter.get('/', async (request, response) => {
  const { status, country, tipo, search, from, to } = request.query
  const page = Math.max(1, Number(request.query.page) || 1)
  const limit = Math.min(200, Math.max(1, Number(request.query.limit) || 50))

  if (country && !['GT', 'SV'].includes(String(country))) {
    return response.status(400).json({ error: 'El país debe ser GT o SV.' })
  }
  if ([from, to].some((value) => value && Number.isNaN(new Date(String(value)).getTime()))) {
    return response.status(400).json({ error: 'El rango de fechas no es válido.' })
  }

  const scopedCountry = request.scope.country || (country ? String(country) : null)
  if (country && scopedCountry && String(country) !== scopedCountry) {
    return response.json({ data: [], total: 0, page, limit, pages: 0 })
  }
  const countries = scopedCountry ? [scopedCountry] : ['GT', 'SV']
  const external = await getExternalRequests(countries)
  const localRecords = await Request.find({
    externalId: { $in: external.map((item) => item.externalId) },
  }).select(LOCAL_PROJECTION).lean()
  const localById = new Map(localRecords.map((item) => [item.externalId, item]))
  const searchTerm = search
    ? new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    : null
  const fromDate = from ? new Date(String(from)) : MIN_DATE
  const toDate = to ? new Date(String(to)) : null
  const filtered = external.map((item) => combineRequest(item, localById.get(item.externalId)))
    .filter((item) => !item.deletedLocally)
    .filter((item) => !status || item.localStatus === String(status))
    .filter((item) => !tipo || item.tipoSolicitud === String(tipo))
    .filter((item) => !fromDate || item.fecha >= (fromDate > MIN_DATE ? fromDate : MIN_DATE))
    .filter((item) => !toDate || item.fecha <= toDate)
    .filter((item) => !searchTerm || [
      item.documento, item.clienteNombre, item.clienteCodigo,
      ...item.items.map((line) => line.descripcion),
    ].some((value) => searchTerm.test(value)))
    .sort((left, right) => right.fecha - left.fecha || right.documento.localeCompare(left.documento))
  const total = filtered.length
  const data = filtered.slice((page - 1) * limit, page * limit)
  response.json({ data, total, page, limit, pages: Math.ceil(total / limit) })
})

requestsRouter.get('/:externalId', async (request, response) => {
  const external = await getExternalRequest(request.params.externalId)
  if (!external || (request.scope.country && external.country !== request.scope.country)) {
    return response.status(404).json({ error: 'Solicitud no encontrada en la API externa.' })
  }
  const local = await Request.findOne({
    externalId: request.params.externalId,
  }).select(LOCAL_PROJECTION).lean()
  if (local?.deletedLocally) return response.status(404).json({ error: 'Solicitud no encontrada.' })
  response.json(combineRequest(external, local))
})

requestsRouter.post('/:externalId/decide-approval', requireRole(ROLES.GERENTE_GENERAL), async (request, response) => {
  const { status, note = '' } = request.body ?? {}
  if (![LOCAL_STATUS.APROBADA, LOCAL_STATUS.NO_APROBADA].includes(status)) {
    return response.status(400).json({ error: 'La decisión debe ser Aprobada o No Aprobada.' })
  }
  if (status === LOCAL_STATUS.NO_APROBADA && !String(note).trim()) {
    return response.status(400).json({ error: 'Escribe una justificación para rechazar la solicitud.' })
  }

  const now = new Date()
  const updated = await Request.findOneAndUpdate({
    externalId: request.params.externalId,
    deletedLocally: false,
    localStatus: LOCAL_STATUS.PENDIENTE,
    approvalSentTo: { $ne: null },
    approvalDeferredBy: null,
    ...request.scope,
  }, {
    $set: {
      localStatus: status,
      approvalDecidedAt: now,
      approvalDecidedBy: request.user.email,
      approvalDecidedVia: 'dashboard',
      approvalTokenUsedAt: now,
      approvalDeferredAt: null,
      approvalDeferredBy: null,
    },
    $push: {
      approvalHistory: {
        status,
        previousStatus: LOCAL_STATUS.PENDIENTE,
        by: request.user.email,
        via: 'dashboard',
        at: now,
        note: String(note).trim().slice(0, 5000),
      },
    },
  }, { returnDocument: 'after' }).select(LOCAL_PROJECTION)

  if (!updated) {
    return response.status(409).json({ error: 'La solicitud ya fue decidida o no está pendiente de aprobación.' })
  }
  const external = await getExternalRequest(request.params.externalId)
  if (!external) return response.status(404).json({ error: 'Solicitud ya no disponible en la API externa.' })
  response.json(combineRequest(external, updated))
})

// Solo campos locales: la API externa sigue siendo la duena del resto.
requestsRouter.patch('/:externalId', async (request, response) => {
  const filter = { externalId: request.params.externalId, deletedLocally: false, ...request.scope }
  const external = await getExternalRequest(request.params.externalId)
  if (!external || (request.scope.country && external.country !== request.scope.country)) {
    return response.status(404).json({ error: 'Solicitud no encontrada.' })
  }
  const current = await ensureLocalState(external)
  if (!current || current.deletedLocally) return response.status(404).json({ error: 'Solicitud no encontrada.' })

  const update = {}
  const push = {}
  if (request.body?.localStatus !== undefined) {
    if (!Object.values(LOCAL_STATUS).includes(request.body.localStatus)) {
      return response.status(400).json({ error: 'localStatus invalido.' })
    }
    update.localStatus = request.body.localStatus
    // Quien decide y por donde queda registrado para la auditoria.
    if (request.body.localStatus !== current.localStatus) {
      if (current.approvalSentTo) {
        return response.status(409).json({ error: 'Decide esta solicitud desde la bandeja de aprobaciones o el correo.' })
      }
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
        note: String(request.body.note ?? 'Decisión desde el panel.').slice(0, 5000),
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

  const updateFilter = { ...filter }
  if (push.approvalHistory) updateFilter.localStatus = current.localStatus
  const updated = await Request.findOneAndUpdate(updateFilter, mutation, {
    returnDocument: 'after',
  }).select(LOCAL_PROJECTION)
  if (!updated) {
    return response.status(push.approvalHistory ? 409 : 404).json({
      error: push.approvalHistory ? 'La solicitud ya fue decidida.' : 'Solicitud no encontrada.',
    })
  }
  response.json(combineRequest(external, updated))
})

requestsRouter.post('/:externalId/defer-approval', requireRole(ROLES.GERENTE_GENERAL), async (request, response) => {
  const updated = await Request.findOneAndUpdate({
    externalId: request.params.externalId,
    deletedLocally: false,
    localStatus: LOCAL_STATUS.PENDIENTE,
    approvalSentTo: { $ne: null },
    approvalDeferredBy: null,
    ...request.scope,
  }, {
    $set: {
      approvalDeferredAt: new Date(),
      approvalDeferredBy: request.user.email,
    },
  }, { returnDocument: 'after'   }).select(LOCAL_PROJECTION)

  if (!updated) {
    return response.status(404).json({ error: 'No se encontró una solicitud pendiente enviada a aprobación.' })
  }
  const external = await getExternalRequest(request.params.externalId)
  response.json(combineRequest(external, updated))
})

requestsRouter.post('/:externalId/restore-approval', requireRole(ROLES.GERENTE_GENERAL), async (request, response) => {
  const updated = await Request.findOneAndUpdate({
    externalId: request.params.externalId,
    deletedLocally: false,
    localStatus: LOCAL_STATUS.PENDIENTE,
    approvalSentTo: { $ne: null },
    ...request.scope,
  }, {
    $set: { approvalDeferredAt: null, approvalDeferredBy: null },
  }, { returnDocument: 'after'   }).select(LOCAL_PROJECTION)

  if (!updated) {
    return response.status(404).json({ error: 'No se encontró una solicitud pospuesta por este usuario.' })
  }
  const external = await getExternalRequest(request.params.externalId)
  response.json(combineRequest(external, updated))
})

// Borrado local: se oculta la solicitud sin persistir sus datos operativos.
requestsRouter.delete('/:externalId', async (request, response) => {
  const external = await getExternalRequest(request.params.externalId)
  if (!external || (request.scope.country && external.country !== request.scope.country)) {
    return response.status(404).json({ error: 'Solicitud no encontrada.' })
  }
  await ensureLocalState(external)
  const updated = await Request.findOneAndUpdate(
    { externalId: request.params.externalId, ...request.scope },
    { $set: { deletedLocally: true } },
    { returnDocument: 'after' },
  ).select('externalId deletedLocally')
  if (!updated) return response.status(404).json({ error: 'Solicitud no encontrada.' })
  response.json(updated)
})

requestsRouter.post('/:externalId/restore', async (request, response) => {
  const external = await getExternalRequest(request.params.externalId)
  if (!external || (request.scope.country && external.country !== request.scope.country)) {
    return response.status(404).json({ error: 'Solicitud no encontrada.' })
  }
  await ensureLocalState(external)
  const updated = await Request.findOneAndUpdate(
    { externalId: request.params.externalId, ...request.scope },
    { $set: { deletedLocally: false } },
    { returnDocument: 'after' },
  ).select('externalId deletedLocally')
  if (!updated) return response.status(404).json({ error: 'Solicitud no encontrada.' })
  response.json(updated)
})

// Reintento manual de un envio a SAP que quedo en fallido, para cuando se
// corrige la causa (credenciales, endpoint caido) sin esperar otra decision.
requestsRouter.post('/:externalId/sap-retry', requireRole(ROLES.GERENTE_GENERAL), async (request, response) => {
  const summary = await retrySapPush(request.params.externalId)
  if (!summary) {
    return response.status(404).json({ error: 'No hay un envio fallido para esa solicitud.' })
  }
  return response.json(summary)
})

requestsRouter.post('/:externalId/send-approval', async (request, response) => {
  const configError = getBrevoConfigError()
  if (configError) {
    console.error(`[approval-email] ${configError}`)
    return response.status(503).json({ error: configError })
  }

  const external = await getExternalRequest(request.params.externalId)
  if (!external || (request.scope.country && external.country !== request.scope.country)) {
    return response.status(404).json({ error: 'Solicitud no encontrada en la API externa.' })
  }
  const target = await ensureLocalState(external)
  if (target.deletedLocally || target.localStatus !== LOCAL_STATUS.PENDIENTE) {
    return response.status(404).json({ error: 'Solo se pueden enviar solicitudes pendientes a aprobación.' })
  }

  const issued = await issueApprovalToken(external, process.env.BREVO_EDUARDO_EMAIL)
  if (!issued) return response.status(404).json({ error: 'Solicitud no encontrada.' })

  try {
    const sent = await sendApprovalEmail({
      request: combineRequest(external, issued.request),
      token: issued.token,
      additionalInfo: request.body?.additionalInfo,
    })
    response.json({ ...sent, expiresAt: issued.expiresAt })
  } catch (error) {
    await invalidateApprovalToken(target.externalId, issued.token)
    console.error(`[approval-email] ${error.message}`)
    response.status(502).json({ error: error.message })
  }
})
