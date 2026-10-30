/**
 * Smoke test HTTP del backend Express completo (auth + roles + aprobacion),
 * sobre MongoDB en memoria y datos reales de la API externa.
 *
 *   node scripts/verifyApi.js
 */
import 'dotenv/config'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { Request, LOCAL_STATUS } from '../server/models/Request.js'
import { User, ROLES } from '../server/models/User.js'
import { getExternalRequests, syncExternalApi } from '../server/services/syncExternalApi.js'
import { issueApprovalToken } from '../server/services/approvalService.js'

process.env.SAP_APPROVAL_ENABLED = 'false'
const { createApp } = await import('../server/app.js')

const log = (...args) => console.log(...args)

const mongod = await MongoMemoryServer.create()
await mongoose.connect(mongod.getUri(), { dbName: 'strflow_http' })

const summary = await syncExternalApi({ force: true })
assert.equal(summary.errors.length, 0)
const externalRequests = summary.requests
log(`API: ${summary.documents} documentos actuales; MongoDB no recibe sus datos operativos.\n`)

const passwordHash = await bcrypt.hash('secreto123', 10)
await User.create([
  { email: 'general@red.com', name: 'General', passwordHash, role: ROLES.GERENTE_GENERAL },
  { email: 'sv@red.com', name: 'Regional SV', passwordHash, role: ROLES.GERENTE_REGIONAL, country: 'SV' },
])

const server = createApp().listen(0)
await new Promise((resolve) => server.once('listening', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const call = async (path, options = {}) => {
  const response = await fetch(base + path, options)
  const text = await response.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  return { status: response.status, body }
}
const asUser = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })

// 1. Sin token.
assert.equal((await call('/api/requests')).status, 401)
log('1) GET /api/requests sin token -> 401')

// 2. Login invalido y valido.
assert.equal((await call('/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'general@red.com', password: 'malo' }),
})).status, 401)

const loginGeneral = await call('/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'general@red.com', password: 'secreto123' }),
})
assert.equal(loginGeneral.status, 200)
assert.equal(loginGeneral.body.user.role, ROLES.GERENTE_GENERAL)
const tokenGeneral = loginGeneral.body.token

const loginSV = await call('/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'sv@red.com', password: 'secreto123' }),
})
const tokenSV = loginSV.body.token
assert.equal(loginSV.body.user.country, 'SV')
log('2) login: password incorrecto -> 401; ambos roles -> 200 con JWT')

// 3. Alcance por rol.
const listGeneral = await call('/api/requests?limit=5', { headers: asUser(tokenGeneral) })
const listSV = await call('/api/requests?limit=5', { headers: asUser(tokenSV) })
assert.equal(listGeneral.body.total, summary.documents)
assert.ok(listSV.body.total < listGeneral.body.total)
assert.ok(listSV.body.data.every((item) => item.country === 'SV'))
log(`3) alcance: general ve ${listGeneral.body.total}, regional SV ve ${listSV.body.total}`)

// 4. El regional no puede ampliar su alcance con ?country=GT.
const injected = await call('/api/requests?country=GT&limit=5', { headers: asUser(tokenSV) })
assert.equal(injected.body.total, listSV.body.total)
assert.ok(injected.body.data.every((item) => item.country === 'SV'))
log('4) regional SV con ?country=GT -> sigue viendo solo SV')

// 5. El regional no puede leer un documento de otro pais.
const gtDoc = externalRequests.find((item) => item.country === 'GT')
assert.ok(gtDoc, 'La API debe devolver al menos una solicitud GT vigente.')
assert.equal((await call(`/api/requests/${gtDoc.externalId}`, { headers: asUser(tokenSV) })).status, 404)
assert.equal((await call(`/api/requests/${gtDoc.externalId}`, { headers: asUser(tokenGeneral) })).status, 200)
log('5) GET documento GT: regional SV -> 404, general -> 200')

// 6. El regional no puede escribir en otro pais; el general si.
assert.equal((await call(`/api/requests/${gtDoc.externalId}`, {
  method: 'PATCH', headers: asUser(tokenSV),
  body: JSON.stringify({ internalNotes: 'intruso' }),
})).status, 404)

const patched = await call(`/api/requests/${gtDoc.externalId}`, {
  method: 'PATCH', headers: asUser(tokenGeneral),
  body: JSON.stringify({ localStatus: LOCAL_STATUS.APROBADA, internalNotes: 'Revisado' }),
})
assert.equal(patched.status, 200)
assert.equal(patched.body.localStatus, LOCAL_STATUS.APROBADA)
assert.equal(patched.body.internalNotes, 'Revisado')
assert.equal(patched.body.raw, undefined, 'raw no se expone ni se guarda')
assert.equal(patched.body.approvalTokenHash, undefined, 'el hash del token nunca se expone')
log('6) PATCH: regional en pais ajeno -> 404; general -> 200 (raw y hash ocultos)')

// 7. localStatus invalido.
assert.equal((await call(`/api/requests/${gtDoc.externalId}`, {
  method: 'PATCH', headers: asUser(tokenGeneral),
  body: JSON.stringify({ localStatus: 'Inventado' }),
})).status, 400)
log('7) PATCH con localStatus invalido -> 400')

// 8. Borrado local y restauracion.
assert.equal((await call(`/api/requests/${gtDoc.externalId}`, {
  method: 'DELETE', headers: asUser(tokenGeneral),
})).status, 200)
assert.equal((await call(`/api/requests/${gtDoc.externalId}`, { headers: asUser(tokenGeneral) })).status, 404)

// Una lectura de la API no modifica el estado local.
await getExternalRequests(['GT'], { force: true })
const stillDeleted = await Request.findOne({ externalId: gtDoc.externalId }).lean()
assert.equal(stillDeleted.deletedLocally, true, 'la bandera sobrevive al sync')
assert.equal(stillDeleted.internalNotes, 'Revisado', 'la nota sobrevive al sync')
assert.equal(stillDeleted.clienteNombre, undefined, 'los datos operativos no se guardan en MongoDB')

assert.equal((await call(`/api/requests/${gtDoc.externalId}/restore`, {
  method: 'POST', headers: asUser(tokenGeneral),
})).status, 200)
log('8) DELETE local -> 404 en lecturas, sobrevive al sync, restore funciona')

// 9. Aprobacion por correo: endpoint publico, sin exponer IDs.
await Request.updateOne({ externalId: gtDoc.externalId }, {
  $set: { localStatus: LOCAL_STATUS.PENDIENTE },
})
const issued = await issueApprovalToken(gtDoc, 'eduardo@example.com')
assert.ok(!issued.token.includes(gtDoc.externalId))

const approve = await call('/api/requests/approve/confirm', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    token: issued.token,
    status: LOCAL_STATUS.APROBADA,
    motivo: 'Aprobación de verificación.',
  }),
})
assert.equal(approve.status, 200)
assert.ok(String(approve.body).includes('Traslado aprobado'))
assert.equal((await Request.findOne({ externalId: gtDoc.externalId }).lean()).localStatus, LOCAL_STATUS.APROBADA)

const replay = await call(`/api/requests/approve?token=${issued.token}&status=No%20Aprobada`)
assert.equal(replay.status, 409)
assert.ok(String(replay.body).includes('ya fue utilizado'))

const bad = await call('/api/requests/approve?token=noexiste&status=Aprobada')
assert.equal(bad.status, 400)
log('9) /approve: sin JWT funciona, 1 solo uso (replay -> 409), token basura -> 400')

// 10. Sync manual solo para el gerente general.
assert.equal((await call('/api/requests/sync', {
  method: 'POST', headers: asUser(tokenSV), body: '{}',
})).status, 403)
const syncCall = await call('/api/requests/sync', {
  method: 'POST', headers: asUser(tokenGeneral), body: JSON.stringify({ countries: ['SV'] }),
})
assert.equal(syncCall.status, 200)
log(`10) POST /sync: regional -> 403; general -> 200 (${syncCall.body.documents} docs SV)`)

await new Promise((resolve, reject) => {
  server.close((error) => (error ? reject(error) : resolve()))
})
await mongoose.disconnect()
await mongod.stop()
log('\nSMOKE TEST HTTP: TODO OK')
