// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

process.env.SAP_APPROVAL_ENABLED = 'false'

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
})
