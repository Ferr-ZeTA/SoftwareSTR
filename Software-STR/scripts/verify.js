/**
 * Verifica la lectura de la API y que MongoDB solo conserve el estado local.
 *
 *   node scripts/verify.js
 */
import 'dotenv/config'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { Request, LOCAL_STATUS } from '../server/models/Request.js'
import { User, ROLES } from '../server/models/User.js'
import { getExternalRequests } from '../server/services/syncExternalApi.js'
import { issueApprovalToken, consumeApprovalToken } from '../server/services/approvalService.js'
import { scopeFilter } from '../server/middleware/auth.js'

const mongo = await MongoMemoryServer.create()
try {
  await mongoose.connect(mongo.getUri(), { dbName: 'strflow_state_test' })
  const requests = await getExternalRequests()
  assert.ok(requests.length > 0, 'la API debe devolver solicitudes vigentes')
  assert.equal(await Request.countDocuments(), 0, 'consultar la API no debe insertar payload operativo')

  const source = requests[0]
  const issued = await issueApprovalToken(source, 'gerente@example.com')
  const saved = await Request.findOne({ externalId: source.externalId }).lean()
  assert.equal(saved.country, source.country)
  assert.equal(saved.approvalTokenHash.length, 64)
  for (const field of [
    'documento', 'fecha', 'clienteNombre', 'clienteCodigo',
    'bodegaOrigen', 'bodegaDestino', 'items', 'raw',
  ]) {
    assert.equal(saved[field], undefined, `MongoDB no debe guardar ${field}`)
  }

  const decision = await consumeApprovalToken(issued.token, LOCAL_STATUS.APROBADA)
  assert.equal(decision.ok, true)
  assert.equal(decision.request.localStatus, LOCAL_STATUS.APROBADA)
  assert.equal((await consumeApprovalToken(issued.token, LOCAL_STATUS.NO_APROBADA)).reason, 'used')

  const general = new User({ role: ROLES.GERENTE_GENERAL })
  const regional = new User({ role: ROLES.GERENTE_REGIONAL, country: 'SV' })
  assert.deepEqual(scopeFilter(general), {})
  assert.deepEqual(scopeFilter(regional), { country: 'SV' })

  console.log(`Verificación correcta: ${requests.length} solicitudes leídas; estado de aprobación local probado.`)
} finally {
  await mongoose.disconnect()
  await mongo.stop()
}
