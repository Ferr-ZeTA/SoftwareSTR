import crypto from 'node:crypto'
import { Request, LOCAL_STATUS } from '../models/Request.js'

const TOKEN_TTL_HOURS = Number(process.env.APPROVAL_TOKEN_TTL_HOURS || 72)

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// Genera un token de un solo uso. Devuelve el token plano (solo para el correo);
// en la DB queda únicamente el hash, así que el ID nunca viaja en la URL.
export async function issueApprovalToken(externalId, sentTo = null) {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 3600_000)

  const updated = await Request.findOneAndUpdate(
    { externalId, deletedLocally: false },
    {
      $set: {
        approvalTokenHash: hashToken(token),
        approvalTokenExpiresAt: expiresAt,
        approvalTokenUsedAt: null,
        approvalSentTo: sentTo,
      },
    },
    { returnDocument: 'after' },
  )
  if (!updated) return null
  return { token, expiresAt, request: updated }
}

// Consume el token de forma atómica: el filtro exige approvalTokenUsedAt: null,
// así que un segundo clic con el mismo enlace no encuentra documento.
export async function consumeApprovalToken(token, status) {
  if (!token || !Object.values(LOCAL_STATUS).includes(status)) {
    return { ok: false, reason: 'invalid' }
  }

  const now = new Date()
  const target = await Request.findOne({
    approvalTokenHash: hashToken(token),
    approvalTokenUsedAt: null,
    approvalTokenExpiresAt: { $gt: now },
    deletedLocally: false,
  }).select('localStatus approvalSentTo').lean()

  // El filtro vuelve a exigir approvalTokenUsedAt: null, asi que si dos
  // clics llegan a la vez solo uno encuentra el documento.
  const updated = target && await Request.findOneAndUpdate(
    {
      approvalTokenHash: hashToken(token),
      approvalTokenUsedAt: null,
      approvalTokenExpiresAt: { $gt: now },
      deletedLocally: false,
    },
    {
      $set: {
        localStatus: status,
        approvalTokenUsedAt: now,
        approvalDecidedAt: now,
        approvalDecidedBy: target.approvalSentTo,
        approvalDecidedVia: 'correo',
      },
      $push: {
        approvalHistory: {
          status,
          previousStatus: target.localStatus,
          by: target.approvalSentTo,
          via: 'correo',
          at: now,
          note: 'Respuesta desde el enlace del correo.',
        },
      },
    },
    { returnDocument: 'after' },
  )

  if (updated) return { ok: true, request: updated }

  // Distingue "ya usado / expirado" de "token desconocido" sin revelar el ID.
  const existing = await Request.findOne({ approvalTokenHash: hashToken(token) })
    .select('approvalTokenUsedAt approvalTokenExpiresAt')
    .lean()
  if (!existing) return { ok: false, reason: 'unknown' }
  if (existing.approvalTokenUsedAt) return { ok: false, reason: 'used' }
  return { ok: false, reason: 'expired' }
}
