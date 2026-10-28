import crypto from 'node:crypto'
import { LOCAL_STATUS } from '../models/Request.js'
const TOKEN_TTL_HOURS = Number(process.env.APPROVAL_TOKEN_TTL_HOURS || 72)

// El modo demo no escribe en Mongo: las solicitudes quemadas y sus tokens
// viven solo aqui, en la memoria del proceso. Al reiniciar la API los enlaces
// que ya se enviaron dejan de servir, y eso es lo esperado en una demo.
const entries = new Map()

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function prune(now) {
  for (const [hash, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(hash)
  }
}

// Reconstruye la forma que espera el correo a partir del objeto que manda el
// frontend (el de adapt()), sin pasar por el modelo de Mongo.
function toEmailShape(demo) {
  const items = (Array.isArray(demo.items) ? demo.items : []).map((item) => ({
    modelo: item?.modelo ?? '',
    descripcion: item?.descripcion ?? '',
    cantidad: Number(item?.cantidad) || 0,
  }))

  return {
    externalId: demo.id,
    documento: demo.documento ?? '',
    country: demo.pais,
    fecha: demo.fechaISO ?? null,
    clienteCodigo: demo.clienteCodigo ?? '',
    clienteNombre: demo.cliente ?? '',
    bodegaOrigen: demo.bodegaOrigen ?? '',
    bodegaDestino: demo.bodegaDestino ?? '',
    tipoSolicitud: demo.tipoSolicitud ?? '',
    items,
    totalLineas: Number(demo.totalLineas) || items.length,
    totalCantidad: Number(demo.totalCantidad)
      || items.reduce((total, item) => total + item.cantidad, 0),
    localStatus: LOCAL_STATUS.PENDIENTE,
  }
}

export function issueDemoApprovalToken(demo, sentTo = null) {
  const now = new Date()
  prune(now)

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_HOURS * 3600_000)
  const request = toEmailShape(demo)

  entries.set(hashToken(token), {
    request,
    sentTo,
    expiresAt,
    usedAt: null,
    sap: null,
  })

  return { token, expiresAt, request }
}

// Igual que el flujo real: el enlace del correo solo abre el formulario.
export function peekDemoApprovalToken(token) {
  if (!token) return null

  const entry = entries.get(hashToken(token))
  if (!entry) return null

  if (entry.usedAt) return { ok: false, reason: 'used' }
  if (entry.expiresAt <= new Date()) return { ok: false, reason: 'expired' }
  return { ok: true, request: entry.request }
}

// Devuelve null cuando el token no es de la demo, para que la ruta siga con
// el flujo normal contra Mongo.
export function consumeDemoApprovalToken(token, status, sap = {}) {
  if (!token) return null

  const entry = entries.get(hashToken(token))
  if (!entry) return null

  if (!Object.values(LOCAL_STATUS).includes(status)) return { ok: false, reason: 'invalid' }
  if (entry.usedAt) return { ok: false, reason: 'used' }

  const now = new Date()
  if (entry.expiresAt <= now) return { ok: false, reason: 'expired' }

  const previousStatus = entry.request.localStatus

  entry.usedAt = now
  entry.request = { ...entry.request, localStatus: status }
  entry.sap = sap

  return { ok: true, request: entry.request, previousStatus }
}

// El navegador no se entera de lo que se decidio desde el correo, asi que el
// modo demo publica las decisiones ya tomadas para que la UI las consulte.
export function listDemoDecisions() {
  const decisions = []
  for (const entry of entries.values()) {
    if (!entry.usedAt) continue
    decisions.push({
      externalId: entry.request.externalId,
      localStatus: entry.request.localStatus,
      decidedAt: entry.usedAt.toISOString(),
      decidedBy: entry.sentTo,
      motivo: entry.sap?.motivo || '',
      sapUser: entry.sap?.user ?? null,
      sapCode: entry.sap?.code ?? null,
    })
  }
  return decisions
}
