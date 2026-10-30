import crypto from 'node:crypto'
import { Request, LOCAL_DEFAULTS, LOCAL_STATUS } from '../models/Request.js'

const TOKEN_TTL_HOURS = Number(process.env.APPROVAL_TOKEN_TTL_HOURS || 72)
// Segundos que la pagina ofrece para deshacer. Se dan 5 extra de margen en
// el servidor para que un clic justo al limite no se pierda.
export const REVERT_WINDOW_SECONDS = Number(process.env.REVERT_WINDOW_SECONDS || 10)

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function invalidateApprovalToken(externalId, token) {
  return Request.findOneAndUpdate({
    externalId,
    approvalTokenHash: hashToken(token),
    approvalTokenUsedAt: null,
  }, {
    $set: {
      approvalTokenUsedAt: new Date(),
      approvalSentTo: null,
    },
  })
}

// Genera un token de un solo uso. Devuelve el token plano (solo para el correo);
// en la DB queda únicamente el hash, así que el ID nunca viaja en la URL.
export async function issueApprovalToken(source, sentTo = null) {
  const externalId = typeof source === 'string' ? source : source.externalId
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 3600_000)

  const update = {
    $set: {
      approvalTokenHash: hashToken(token),
      approvalTokenExpiresAt: expiresAt,
      approvalTokenUsedAt: null,
      approvalSentTo: sentTo,
    },
  }
  if (typeof source !== 'string') {
    update.$setOnInsert = { ...LOCAL_DEFAULTS, externalId, country: source.country }
    for (const field of Object.keys(update.$set)) delete update.$setOnInsert[field]
  }
  const updated = await Request.findOneAndUpdate(
    { externalId, deletedLocally: false },
    update,
    { returnDocument: 'after', upsert: typeof source !== 'string', setDefaultsOnInsert: true },
  )
  if (!updated) return null
  return { token, expiresAt, request: updated }
}

// Mira el token sin gastarlo: el enlace del correo solo abre el formulario,
// y la decision recien se registra cuando se envia con las credenciales.
export async function peekApprovalToken(token) {
  if (!token) return { ok: false, reason: 'invalid' }

  const now = new Date()
  const request = await Request.findOne({
    approvalTokenHash: hashToken(token),
    deletedLocally: false,
  }).select('-raw').lean()

  if (!request) return { ok: false, reason: 'unknown' }
  if (request.approvalTokenUsedAt) return { ok: false, reason: 'used' }
  if (!(request.approvalTokenExpiresAt > now)) return { ok: false, reason: 'expired' }
  return { ok: true, request }
}

// Consume el token de forma atómica: el filtro exige approvalTokenUsedAt: null,
// así que un segundo clic con el mismo enlace no encuentra documento.
export async function consumeApprovalToken(token, status, sap = {}) {
  if (!token || !Object.values(LOCAL_STATUS).includes(status)) {
    return { ok: false, reason: 'invalid' }
  }

  const now = new Date()
  const target = await Request.findOne({
    approvalTokenHash: hashToken(token),
    approvalTokenUsedAt: null,
    approvalTokenExpiresAt: { $gt: now },
    deletedLocally: false,
    localStatus: LOCAL_STATUS.PENDIENTE,
  }).select('localStatus approvalSentTo').lean()

  // El filtro vuelve a exigir approvalTokenUsedAt: null, asi que si dos
  // clics llegan a la vez solo uno encuentra el documento.
  const updated = target && await Request.findOneAndUpdate(
    {
      approvalTokenHash: hashToken(token),
      approvalTokenUsedAt: null,
      approvalTokenExpiresAt: { $gt: now },
      deletedLocally: false,
      localStatus: LOCAL_STATUS.PENDIENTE,
    },
    {
      $set: {
        localStatus: status,
        approvalTokenUsedAt: now,
        approvalDecidedAt: now,
        approvalDecidedBy: target.approvalSentTo,
        approvalDecidedVia: 'correo',
        // Lo que SAP respondio queda guardado como constancia. La clave nunca:
        // solo el usuario con el que se autorizo.
        sapPushStatus: sap.status,
        sapPushAt: now,
        sapPushCode: sap.code,
        sapPushError: sap.error,
        sapAuthorizedBy: sap.user,
      },
      $push: {
        approvalHistory: {
          status,
          previousStatus: target.localStatus,
          by: target.approvalSentTo,
          via: 'correo',
          at: now,
          note: sap.motivo || 'Respuesta desde el enlace del correo.',
        },
      },
    },
    { returnDocument: 'after' },
  )

  if (updated) {
    return { ok: true, request: updated, previousStatus: target.localStatus }
  }

  // Distingue "ya usado / expirado" de "token desconocido" sin revelar el ID.
  const existing = await Request.findOne({ approvalTokenHash: hashToken(token) })
    .select('approvalTokenUsedAt approvalTokenExpiresAt localStatus')
    .lean()
  if (!existing) return { ok: false, reason: 'unknown' }
  if (existing.approvalTokenUsedAt) return { ok: false, reason: 'used' }
  if (existing.localStatus !== LOCAL_STATUS.PENDIENTE) return { ok: false, reason: 'decided' }
  return { ok: false, reason: 'expired' }
}
