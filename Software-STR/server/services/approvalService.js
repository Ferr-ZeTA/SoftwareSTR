import crypto from 'node:crypto'
import { Request, LOCAL_STATUS } from '../models/Request.js'

const TOKEN_TTL_HOURS = Number(process.env.APPROVAL_TOKEN_TTL_HOURS || 72)
// Segundos que la pagina ofrece para deshacer. Se dan 5 extra de margen en
// el servidor para que un clic justo al limite no se pierda.
export const REVERT_WINDOW_SECONDS = Number(process.env.REVERT_WINDOW_SECONDS || 10)
const REVERT_GRACE_SECONDS = 5

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
  const revertToken = crypto.randomBytes(24).toString('hex')
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
        revertTokenHash: hashToken(revertToken),
        revertTokenExpiresAt: new Date(
          now.getTime() + (REVERT_WINDOW_SECONDS + REVERT_GRACE_SECONDS) * 1000,
        ),
        revertTokenUsedAt: null,
        revertToStatus: target.localStatus,
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

  if (updated) {
    return {
      ok: true,
      request: updated,
      revertToken,
      previousStatus: target.localStatus,
      revertSeconds: REVERT_WINDOW_SECONDS,
    }
  }

  // Distingue "ya usado / expirado" de "token desconocido" sin revelar el ID.
  const existing = await Request.findOne({ approvalTokenHash: hashToken(token) })
    .select('approvalTokenUsedAt approvalTokenExpiresAt')
    .lean()
  if (!existing) return { ok: false, reason: 'unknown' }
  if (existing.approvalTokenUsedAt) return { ok: false, reason: 'used' }
  return { ok: false, reason: 'expired' }
}

// Deshace la decision dentro de la ventana. Tambien de un solo uso: el
// filtro exige revertTokenUsedAt: null y que no haya expirado.
export async function revertDecision(token) {
  if (!token) return { ok: false, reason: 'invalid' }

  const now = new Date()
  const hash = hashToken(token)
  const target = await Request.findOne({ revertTokenHash: hash })
    .select('localStatus revertToStatus revertTokenUsedAt revertTokenExpiresAt approvalDecidedBy')
    .lean()

  if (!target) return { ok: false, reason: 'unknown' }
  if (target.revertTokenUsedAt) return { ok: false, reason: 'used' }
  if (!(target.revertTokenExpiresAt > now)) return { ok: false, reason: 'expired' }

  const restored = target.revertToStatus ?? LOCAL_STATUS.PENDIENTE
  const updated = await Request.findOneAndUpdate(
    { revertTokenHash: hash, revertTokenUsedAt: null, revertTokenExpiresAt: { $gt: now } },
    {
      $set: {
        localStatus: restored,
        revertTokenUsedAt: now,
        approvalDecidedAt: now,
        approvalDecidedVia: 'correo',
      },
      $push: {
        approvalHistory: {
          status: restored,
          previousStatus: target.localStatus,
          by: target.approvalDecidedBy,
          via: 'correo',
          at: now,
          note: 'Decision revertida dentro de la ventana de arrepentimiento.',
        },
      },
    },
    { returnDocument: 'after' },
  )

  if (!updated) return { ok: false, reason: 'used' }
  return { ok: true, request: updated, restoredTo: restored }
}
