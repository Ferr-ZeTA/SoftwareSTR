// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import jwt from 'jsonwebtoken'

process.env.SAP_APPROVAL_ENABLED = 'false'
process.env.JWT_SECRET = 'test-secret-for-approval-routes'

const [{ createApp }, { Request }, { issueApprovalToken }] = await Promise.all([
  import('../app.js'),
  import('../models/Request.js'),
  import('../services/approvalService.js'),
])

let mongo
let server
let base

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri(), { dbName: 'strflow_approval_test' })
  server = createApp().listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

afterEach(async () => {
  await Request.deleteMany({})
})

afterAll(async () => {
  if (server) await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  await mongoose.disconnect()
  if (mongo) await mongo.stop()
})

async function createPendingRequest() {
  const request = await Request.create({
    externalId: 'GT-approval-test',
    documento: 'approval-test',
    country: 'GT',
    clienteNombre: 'Cliente de prueba',
  })
  return issueApprovalToken(request.externalId, 'gerente@example.com')
}

function managerHeaders() {
  const token = jwt.sign({
    sub: 'manager-1',
    email: 'gerente@example.com',
    role: 'GERENTE_GENERAL',
    country: null,
  }, process.env.JWT_SECRET)
  return { Authorization: `Bearer ${token}` }
}

describe('aprobacion por correo', () => {
  it('muestra solo la justificacion como campo editable', async () => {
    const issued = await createPendingRequest()
    const response = await fetch(
      `${base}/api/requests/approve?token=${issued.token}&status=Aprobada`,
    )
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('name="motivo"')
    expect(html).not.toMatch(/name="(?:usuario|clave)"|id="(?:usuario|clave)"/)
    expect(html).not.toMatch(/Credenciales del aprobador|Usuario de SAP|Clave de SAP/)
  })

  it('guarda decision y justificacion sin recibir credenciales', async () => {
    const issued = await createPendingRequest()
    const response = await fetch(`${base}/api/requests/approve/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: issued.token,
        status: 'Aprobada',
        motivo: 'Stock confirmado con bodega.',
      }),
    })
    const html = await response.text()
    const saved = await Request.findOne({ externalId: 'GT-approval-test' }).lean()

    expect(response.status).toBe(200)
    expect(html).toContain('Traslado aprobado')
    expect(saved.localStatus).toBe('Aprobada')
    expect(saved.approvalHistory.at(-1).note).toBe('Stock confirmado con bodega.')
    expect(saved.sapPushCode).toBe('simulado')
    expect(saved.sapAuthorizedBy).toBeNull()
  })

  it('refleja la decision del correo en el listado autenticado', async () => {
    const issued = await createPendingRequest()
    await fetch(`${base}/api/requests/approve/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: issued.token,
        status: 'Aprobada',
        motivo: 'Aprobada por correo.',
      }),
    })

    const response = await fetch(`${base}/api/requests`, { headers: managerHeaders() })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.data[0].localStatus).toBe('Aprobada')
  })

  it('permite decidir en el dashboard y bloquea despues el enlace del correo', async () => {
    const issued = await createPendingRequest()
    const response = await fetch(`${base}/api/requests/GT-approval-test/decide-approval`, {
      method: 'POST',
      headers: { ...managerHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Aprobada', note: 'Stock confirmado.' }),
    })
    const saved = await Request.findOne({ externalId: 'GT-approval-test' }).lean()
    const emailResponse = await fetch(
      `${base}/api/requests/approve?token=${issued.token}&status=No%20Aprobada`,
    )

    expect(response.status).toBe(200)
    expect(saved.localStatus).toBe('Aprobada')
    expect(saved.approvalHistory.at(-1).note).toBe('Stock confirmado.')
    expect(saved.approvalTokenUsedAt).toBeTruthy()
    expect(emailResponse.status).toBe(409)
    expect(await emailResponse.text()).toContain('ya fue utilizado')
  })

  it('guarda las aprobaciones pospuestas y permite devolverlas a la bandeja', async () => {
    await createPendingRequest()
    const headers = managerHeaders()

    const deferred = await fetch(`${base}/api/requests/GT-approval-test/defer-approval`, {
      method: 'POST',
      headers,
    })
    const deferredRequest = await Request.findOne({ externalId: 'GT-approval-test' }).lean()
    const restored = await fetch(`${base}/api/requests/GT-approval-test/restore-approval`, {
      method: 'POST',
      headers,
    })
    const restoredRequest = await Request.findOne({ externalId: 'GT-approval-test' }).lean()

    expect(deferred.status).toBe(200)
    expect(deferredRequest.approvalDeferredBy).toBe('gerente@example.com')
    expect(deferredRequest.approvalDeferredAt).toBeTruthy()
    expect(restored.status).toBe(200)
    expect(restoredRequest.approvalDeferredBy).toBeNull()
    expect(restoredRequest.approvalDeferredAt).toBeNull()
  })

  it('exige una justificacion para rechazar desde el dashboard y solo permite al gerente general', async () => {
    await createPendingRequest()
    const noReason = await fetch(`${base}/api/requests/GT-approval-test/decide-approval`, {
      method: 'POST',
      headers: { ...managerHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'No Aprobada', note: '  ' }),
    })

    expect(noReason.status).toBe(400)
    const regionalToken = jwt.sign({
      sub: 'regional-1',
      email: 'regional@example.com',
      role: 'GERENTE_REGIONAL',
      country: 'GT',
    }, process.env.JWT_SECRET)
    const forbidden = await fetch(`${base}/api/requests/GT-approval-test/decide-approval`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${regionalToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'Aprobada' }),
    })

    expect(forbidden.status).toBe(403)
  })
})
