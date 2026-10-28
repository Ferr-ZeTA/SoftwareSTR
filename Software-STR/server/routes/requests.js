import { Router } from 'express'
import { Request, LOCAL_STATUS, SAP_PUSH_STATUS } from '../models/Request.js'
import { ROLES } from '../models/User.js'
import { authenticate, enforceScope, requireRole } from '../middleware/auth.js'
import {
  issueApprovalToken, consumeApprovalToken, peekApprovalToken, REVERT_WINDOW_SECONDS,
} from '../services/approvalService.js'
import { sendApprovalEmail, escapeHtml } from '../services/mailer.js'
import { syncExternalApi } from '../services/syncExternalApi.js'
import { authorizeInSap } from '../services/sapApproval.js'
import {
  issueDemoApprovalToken,
  consumeDemoApprovalToken,
  peekDemoApprovalToken,
  listDemoDecisions,
} from '../services/demoApprovals.js'

export const requestsRouter = Router()
const demoMode = process.env.DEMO_MODE !== 'false'

const LIST_PROJECTION = '-raw -approvalTokenHash'

// Motivos por los que un enlace del correo deja de servir.
const LINK_ERRORS = {
  used: 'Este enlace ya fue utilizado. Cada enlace sirve una sola vez.',
  expired: 'Este enlace expiro. Solicita que se reenvie la aprobacion.',
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

// Pagina que abre el enlace del correo. Dos pasos en una sola carga:
// 1. Resumen de lo que se va a decidir, con cuenta regresiva para arrepentirse.
// 2. Cerrada la cuenta, el formulario de credenciales de SAP.
// La decision no se registra hasta que se envia el formulario, asi que
// abandonar la pagina no deja nada escrito.
function approvalGatePage({ request, status, token, seconds, error, demo, valores = {} }) {
  valores = { usuario: '', motivo: '', ...valores }
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
 .demo{background:#fef3e2;border:1px solid #f6ddb4;color:#b45309;padding:10px 13px;
   border-radius:9px;font-size:12.5px;margin-bottom:16px}
 .hidden{display:none}
 .fieldset{border:1px solid #e4ebf2;border-radius:11px;padding:14px 16px 16px;margin-top:16px;position:relative}
 .legend{position:absolute;top:-9px;left:12px;background:#fff;padding:0 7px;
   font-size:10.5px;font-weight:bold;letter-spacing:.07em;text-transform:uppercase;color:#64748b}
 .fieldset label:first-of-type{margin-top:4px}
 .grid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}
 input[readonly]{background:#f4f7fa;color:#526276;cursor:not-allowed}
 textarea{width:100%;padding:11px 13px;border:1px solid #cbd5e1;border-radius:9px;
   font-size:14px;font-family:inherit;resize:vertical}
 textarea:focus{outline:2px solid ${color};outline-offset:1px;border-color:${color}}
 label em{font-weight:normal;color:#94a3b8;font-style:normal}
 @media(max-width:460px){.grid{grid-template-columns:1fr}}
</style></head>
<body><div class="card">
 <div class="head">
   <div class="brand">STR<span>flow</span></div>
   <div class="sub">Confirmación de ${aprueba ? 'aprobación' : 'rechazo'}</div>
 </div>
 <div class="body">
   ${demo ? '<div class="demo"><b>Modo demostración.</b> No se escribe nada en SAP: cualquier usuario y clave sirven para recorrer el flujo.</div>' : ''}
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
     <div class="fieldset">
       <span class="legend">Documento</span>
       <div class="grid">
         <div>
           <label for="documento">ID del documento</label>
           <input id="documento" name="documento" value="${escapeHtml(request.documento)}" readonly>
         </div>
         <div>
           <label for="pais">País</label>
           <input id="pais" name="pais" value="${escapeHtml(request.country)}" readonly>
         </div>
         <div>
           <label for="tipo">Tipo de documento</label>
           <input id="tipo" name="tipo" value="${escapeHtml(request.tipoSolicitud)}" readonly>
         </div>
         <div>
           <label for="decision">Decisión</label>
           <input id="decision" value="${escapeHtml(status)}" readonly>
         </div>
       </div>
       <p class="hint">Estos datos vienen del traslado y viajan tal cual a SAP. No se editan.</p>
     </div>

     <div class="fieldset">
       <span class="legend">Credenciales del aprobador</span>
       <label for="usuario">Usuario de SAP</label>
       <input id="usuario" name="usuario" value="${escapeHtml(valores.usuario)}" required
         autocomplete="off" autocapitalize="none" spellcheck="false">
       <label for="clave">Clave de SAP</label>
       <input id="clave" name="clave" type="password" required autocomplete="off">
       <p class="hint">Deben ser las del usuario autorizado en SAP para este tipo de documento. La clave no se guarda en ningún lado: viaja solo para registrar esta autorización.</p>
     </div>

     <div class="fieldset">
       <span class="legend">Motivo</span>
       <label for="motivo">Razón de la decisión ${aprueba ? '<em>(opcional)</em>' : ''}</label>
       <textarea id="motivo" name="motivo" rows="3" ${aprueba ? '' : 'required'}
         placeholder="${aprueba ? 'Por ejemplo: stock confirmado con bodega.' : 'Explicá por qué no se aprueba.'}">${escapeHtml(valores.motivo)}</textarea>
       <p class="hint">Queda guardado en el historial del traslado junto con tu usuario y la fecha.</p>
     </div>
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
 if (reintento) { document.getElementById('usuario').focus(); }
 var num = document.getElementById('num');
 var reloj = reintento ? null : setInterval(function () {
   restante -= 1;
   if (restante > 0) { num.textContent = restante; return; }
   clearInterval(reloj);
   document.getElementById('espera').classList.add('hidden');
   document.getElementById('form').classList.remove('hidden');
   document.getElementById('usuario').focus();
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

  const result = peekDemoApprovalToken(token) ?? await peekApprovalToken(token)
  if (!result?.ok) {
    const reason = result?.reason || 'unknown'
    return response.status(reason === 'used' ? 409 : 400)
      .send(resultPage(false, 'Enlace no valido', LINK_ERRORS[reason]))
  }

  return response.send(approvalGatePage({
    request: result.request,
    status,
    token,
    seconds: REVERT_WINDOW_SECONDS,
    demo: Boolean(peekDemoApprovalToken(token)),
  }))
})

// Aqui si se registra la decision: primero en SAP, y solo si SAP la acepta se
// gasta el token. Asi una credencial equivocada no quema el enlace.
requestsRouter.post('/approve/confirm', async (request, response) => {
  const { token = '', status = '', usuario = '', clave = '', motivo = '' } = request.body || {}
  response.type('html')

  if (!Object.values(LOCAL_STATUS).includes(status)) {
    return response.status(400).send(resultPage(false, 'Enlace no valido', LINK_ERRORS.invalid))
  }

  const demo = Boolean(peekDemoApprovalToken(token))
  const peeked = peekDemoApprovalToken(token) ?? await peekApprovalToken(token)
  if (!peeked?.ok) {
    const reason = peeked?.reason || 'unknown'
    return response.status(reason === 'used' ? 409 : 400)
      .send(resultPage(false, 'Enlace no valido', LINK_ERRORS[reason]))
  }

  const sap = await authorizeInSap({
    request: peeked.request, status, sapUser: usuario, sapPassword: clave, motivo,
  })

  if (!sap.ok) {
    // Se devuelve el formulario con el motivo. El token sigue sirviendo.
    // Se devuelve lo ya escrito, menos la clave: reescribir todo por un typo
    // en la contrasena es la forma mas rapida de que alguien abandone.
    return response.status(sap.retryable ? 400 : 502).send(approvalGatePage({
      request: peeked.request, status, token, seconds: REVERT_WINDOW_SECONDS, demo,
      error: sap.message, valores: { usuario, motivo },
    }))
  }

  const constancia = {
    status: SAP_PUSH_STATUS.ENVIADO, code: sap.code, error: null, user: usuario, motivo,
  }
  const result = demo
    ? consumeDemoApprovalToken(token, status, constancia)
    : await consumeApprovalToken(token, status, constancia)

  if (!result?.ok) {
    const reason = result?.reason || 'unknown'
    return response.status(reason === 'used' ? 409 : 400)
      .send(resultPage(false, 'Enlace no valido', LINK_ERRORS[reason]))
  }

  return response.send(resultPage(
    true,
    status === LOCAL_STATUS.APROBADA ? 'Traslado aprobado' : 'Traslado rechazado',
    `El traslado <strong>${escapeHtml(result.request.documento)}</strong> quedo como `
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

requestsRouter.get('/demo/decisions', (request, response) => {
  if (!demoMode) return response.status(404).json({ error: 'Modo demo desactivado.' })
  return response.json({ data: listDemoDecisions() })
})

requestsRouter.post('/demo/send-approval', async (request, response) => {
  if (!demoMode) return response.status(404).json({ error: 'Modo demo desactivado.' })

  const demo = request.body?.request
  if (!demo?.id || !['GT', 'SV'].includes(demo.pais)) {
    return response.status(400).json({ error: 'La solicitud demo no es válida.' })
  }

  // Nada de esto toca Mongo: el token y la solicitud quemada viven en memoria.
  const issued = issueDemoApprovalToken(demo, process.env.BREVO_EDUARDO_EMAIL)

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
