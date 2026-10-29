const BREVO_URL = 'https://api.brevo.com/v3/smtp/email'
const REQUIRED_BREVO_ENV = [
  'BREVO_API_KEY',
  'BREVO_EDUARDO_EMAIL',
  'BREVO_SENDER_EMAIL',
]

export function getBrevoConfigStatus(env = process.env) {
  return Object.fromEntries(
    REQUIRED_BREVO_ENV.map((name) => [name, Boolean(env[name]?.trim())]),
  )
}

export function getBrevoConfigError(env = process.env) {
  const missing = Object.entries(getBrevoConfigStatus(env))
    .filter(([, isConfigured]) => !isConfigured)
    .map(([name]) => name)
  if (!missing.length) return null

  return `Configuración de Brevo incompleta. Faltan: ${missing.join(', ')}. `
    + 'Revísalas en Environment del servicio de Render y vuelve a desplegar.'
}

function getBrevoConfig(env = process.env) {
  return Object.fromEntries(
    REQUIRED_BREVO_ENV.map((name) => [name, env[name]?.trim() || '']),
  )
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[character]))
}

function formatDate(value) {
  if (!value) return 'Sin fecha'
  return new Date(value).toLocaleDateString('es-GT', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

// El enlace lleva solo el token: nunca el externalId ni el _id de Mongo.
function approvalEmail({ request, token, additionalInfo }) {
  // En Render, RENDER_EXTERNAL_URL trae la URL publica del servicio, asi que
  // los enlaces del correo funcionan desde cualquier equipo sin configurar nada.
  const base = process.env.APPROVAL_PUBLIC_URL
    || process.env.RENDER_EXTERNAL_URL
    || 'http://localhost:8787'
  const link = (status) =>
    `${base}/api/requests/approve?token=${encodeURIComponent(token)}&status=${encodeURIComponent(status)}`

  const rows = request.items.map((item) => `
    <tr>
      <td style="padding:6px 10px;border-top:1px solid #e5ebef">${escapeHtml(item.modelo)}</td>
      <td style="padding:6px 10px;border-top:1px solid #e5ebef">${escapeHtml(item.descripcion)}</td>
      <td style="padding:6px 10px;border-top:1px solid #e5ebef;text-align:right">${item.cantidad}</td>
    </tr>`).join('')

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#19283b;border:1px solid #e5ebef;border-radius:12px;overflow:hidden">
      <div style="background:#11253d;padding:24px 30px;color:white">
        <div style="font-size:20px;font-weight:bold">STR<span style="color:#54c9b8">flow</span></div>
        <div style="font-size:12px;color:#b6c5d4;margin-top:5px">Solicitud de aprobación</div>
      </div>
      <div style="padding:30px">
        <h2 style="margin-top:0">Aprobación requerida: traslado ${escapeHtml(request.documento)}</h2>
        <div style="background:#f5f8fa;border:1px solid #e5ebef;border-radius:8px;padding:16px">
          <p style="margin:4px 0"><strong>Cliente:</strong> ${escapeHtml(request.clienteNombre)} (${escapeHtml(request.clienteCodigo)})</p>
          <p style="margin:4px 0"><strong>País:</strong> ${escapeHtml(request.country)}</p>
          <p style="margin:4px 0"><strong>Ruta:</strong> ${escapeHtml(request.bodegaOrigen)} &rarr; ${escapeHtml(request.bodegaDestino)}</p>
          <p style="margin:4px 0"><strong>Tipo:</strong> ${escapeHtml(request.tipoSolicitud)}</p>
          <p style="margin:4px 0"><strong>Fecha:</strong> ${escapeHtml(formatDate(request.fecha))}</p>
          <p style="margin:4px 0"><strong>Estado actual:</strong> ${escapeHtml(request.localStatus)}</p>
        </div>
        <table style="width:100%;border-collapse:collapse;margin-top:18px;font-size:13px">
          <thead><tr style="text-align:left;color:#526276">
            <th style="padding:6px 10px">Modelo</th><th style="padding:6px 10px">Descripción</th>
            <th style="padding:6px 10px;text-align:right">Cantidad</th>
          </tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr style="font-weight:bold">
            <td style="padding:8px 10px;border-top:2px solid #11253d" colspan="2">Total (${request.totalLineas} líneas)</td>
            <td style="padding:8px 10px;border-top:2px solid #11253d;text-align:right">${request.totalCantidad}</td>
          </tr></tfoot>
        </table>
        <p style="margin-top:20px"><strong>Información adicional</strong></p>
        <p style="white-space:pre-wrap;color:#526276">${escapeHtml(additionalInfo || 'Sin información adicional.')}</p>
        <p style="margin-top:28px">
          <a href="${link('Aprobada')}" style="background:#e1f6f0;color:#188a74;padding:13px 22px;border-radius:6px;text-decoration:none;font-weight:bold;margin-right:10px">Sí apruebo</a>
          <a href="${link('No Aprobada')}" style="background:#fcecef;color:#c0525e;padding:13px 22px;border-radius:6px;text-decoration:none;font-weight:bold">No apruebo</a>
        </p>
        <p style="color:#9aa8b6;font-size:12px">Este enlace es de un solo uso y expira automáticamente.</p>
      </div>
    </div>
  `
}

export async function sendApprovalEmail({ request, token, additionalInfo }) {
  const { BREVO_API_KEY, BREVO_EDUARDO_EMAIL, BREVO_SENDER_EMAIL } = getBrevoConfig()
  const configError = getBrevoConfigError()
  if (configError) throw new Error(configError)

  const response = await fetch(BREVO_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': BREVO_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { email: BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || 'STRflow' },
      to: [{ email: BREVO_EDUARDO_EMAIL, name: 'Eduardo' }],
      subject: `Aprobación requerida: traslado ${request.documento} (${request.country})`,
      htmlContent: approvalEmail({ request, token, additionalInfo }),
    }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(
      `Brevo rechazó el envío (HTTP ${response.status}): `
      + `${payload.message || 'revisa la API key y el remitente verificado.'}`,
    )
  }
  return { sent: true, messageId: payload.messageId, to: BREVO_EDUARDO_EMAIL }
}

export { escapeHtml }
