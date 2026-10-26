/**
 * Verificacion end-to-end contra la API externa real usando una instancia
 * MongoDB en memoria. Comprueba el invariante central: la sincronizacion
 * incremental no pisa ningun campo de control local.
 *
 *   node scripts/verify.js
 */
import 'dotenv/config'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { Request, LOCAL_STATUS } from '../server/models/Request.js'
import { User, ROLES } from '../server/models/User.js'
import { syncExternalApi } from '../server/services/syncExternalApi.js'
import { issueApprovalToken, consumeApprovalToken } from '../server/services/approvalService.js'
import { scopeFilter } from '../server/middleware/auth.js'

const log = (...args) => console.log(...args)

const mongod = await MongoMemoryServer.create()
await mongoose.connect(mongod.getUri(), { dbName: 'strflow_test' })
log('mongo en memoria listo\n')

// 1. Primera sincronizacion contra la API real.
const first = await syncExternalApi()
log(`1) sync inicial: filas=${first.rows} documentos=${first.documents} `
  + `insertados=${first.upserted} (${first.durationMs}ms) errores=${first.errors.length}`)
assert.equal(first.errors.length, 0, 'la sync no debe tener errores')
assert.ok(first.documents > 0, 'debe traer documentos')
assert.equal(first.upserted, first.documents, 'en DB vacia todo debe insertarse')
assert.equal(await Request.countDocuments(), first.documents)

// 2. Modificaciones locales sobre un documento real.
const target = await Request.findOne({ country: 'GT' }).sort({ fecha: -1 })
log(`\n2) documento de prueba: ${target.externalId} cliente="${target.clienteNombre}" `
  + `lineas=${target.totalLineas} cantidad=${target.totalCantidad}`)

await Request.updateOne({ externalId: target.externalId }, {
  $set: {
    localStatus: LOCAL_STATUS.APROBADA,
    internalNotes: 'Nota interna que NO debe perderse.',
    deletedLocally: true,
  },
})

// Tambien ensuciamos los campos externos para confirmar que la API los recupera.
await Request.updateOne({ externalId: target.externalId }, {
  $set: { clienteNombre: 'VALOR CORRUPTO', totalCantidad: -999 },
})

// 3. Segunda sincronizacion: debe refrescar lo externo y respetar lo local.
const second = await syncExternalApi()
log(`3) sync incremental: insertados=${second.upserted} actualizados=${second.modified} `
  + `coincidencias=${second.matched}`)
assert.equal(second.upserted, 0, 'no debe duplicar documentos')
assert.equal(await Request.countDocuments(), first.documents, 'el conteo no debe cambiar')

const after = await Request.findOne({ externalId: target.externalId })
assert.equal(after.localStatus, LOCAL_STATUS.APROBADA, 'localStatus sobrevive')
assert.equal(after.internalNotes, 'Nota interna que NO debe perderse.', 'internalNotes sobrevive')
assert.equal(after.deletedLocally, true, 'deletedLocally sobrevive')
assert.equal(after.clienteNombre, target.clienteNombre, 'la API restaura el campo externo')
assert.equal(after.totalCantidad, target.totalCantidad, 'la API restaura el total')
log('   campos locales intactos: localStatus, internalNotes, deletedLocally')
log('   campos externos restaurados desde la API: clienteNombre, totalCantidad')

// 4. Token de aprobacion: un solo uso.
await Request.updateOne({ externalId: target.externalId }, {
  $set: { deletedLocally: false, localStatus: LOCAL_STATUS.PENDIENTE },
})
const issued = await issueApprovalToken(target.externalId, 'eduardo@example.com')
assert.ok(issued.token.length === 64, 'token de 32 bytes hex')

const stored = await Request.findOne({ externalId: target.externalId }).select('+approvalTokenHash')
assert.notEqual(stored.approvalTokenHash, issued.token, 'en DB solo se guarda el hash')

const used = await consumeApprovalToken(issued.token, LOCAL_STATUS.APROBADA)
assert.equal(used.ok, true)
assert.equal(used.request.localStatus, LOCAL_STATUS.APROBADA)

const replay = await consumeApprovalToken(issued.token, LOCAL_STATUS.NO_APROBADA)
assert.equal(replay.ok, false)
assert.equal(replay.reason, 'used', 'el segundo uso debe rechazarse')

const bogus = await consumeApprovalToken('a'.repeat(64), LOCAL_STATUS.APROBADA)
assert.equal(bogus.reason, 'unknown')
log('\n4) token: un solo uso OK, replay rechazado, hash en DB (no el token)')

// 5. Aislamiento por rol.
const general = new User({ email: 'g@x.com', name: 'G', passwordHash: 'x', role: ROLES.GERENTE_GENERAL })
const regional = new User({ email: 'r@x.com', name: 'R', passwordHash: 'x', role: ROLES.GERENTE_REGIONAL, country: 'SV' })
assert.deepEqual(scopeFilter(general), {})
assert.deepEqual(scopeFilter(regional), { country: 'SV' })

const totalVisible = await Request.countDocuments({ deletedLocally: false })
const svVisible = await Request.countDocuments({ deletedLocally: false, ...scopeFilter(regional) })
const gtVisible = await Request.countDocuments({ deletedLocally: false, country: 'GT' })
log(`5) alcance: general=${totalVisible}  regional SV=${svVisible}  (GT=${gtVisible})`)
assert.equal(svVisible + gtVisible, totalVisible, 'los paises particionan el total')
assert.ok(svVisible < totalVisible, 'el regional ve menos que el general')

// Un ?country=GT inyectado por un regional SV no amplia su alcance.
const injected = { deletedLocally: false, country: 'GT' }
Object.assign(injected, scopeFilter(regional))
assert.equal(injected.country, 'SV', 'el scope se aplica al final y gana')
log('   inyeccion de ?country=GT por un regional SV: neutralizada')

await mongoose.disconnect()
await mongod.stop()
log('\nTODAS LAS VERIFICACIONES PASARON')
