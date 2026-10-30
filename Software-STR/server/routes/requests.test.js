// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import jwt from 'jsonwebtoken'
import { createServer } from 'node:http'

process.env.SAP_APPROVAL_ENABLED = 'false'
process.env.JWT_SECRET = 'test-secret-for-approval-routes'
process.env.SYNC_MIN_DATE = '2026-10-01T00:00:00Z'
process.env.EXTERNAL_API_KEY = 'test-api-key'

const [{ createApp }, { Request }, { issueApprovalToken }, { clearExternalRequestCache }] = await Promise.all([
  import('../app.js'),
  import('../models/Request.js'),
  import('../services/approvalService.js'),
  import('../services/syncExternalApi.js'),
])

let mongo
let server
let apiServer
let base
let externalRows = { GT: [], SV: [] }
let apiFailureStatus = 200

beforeAll(async () => {
  apiServer = createServer((request, response) => {
    const country = new URL(request.url, 'http://localhost').searchParams.get('var_pais')
    if (apiFailureStatus !== 200) {
      response.statusCode = apiFailureStatus
      return response.end('upstream unavailable')
    }
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify(externalRows[country] || []))
  })
  await new Promise((resolve) => apiServer.listen(0, resolve))
  process.env.EXTERNAL_API_URL = `http://127.0.0.1:${apiServer.address().port}/requests`
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri(), { dbName: 'strflow_approval_test' })
  server = createApp().listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

afterEach(async () => {
  await Request.deleteMany({})
  externalRows = { GT: [], SV: [] }
  apiFailureStatus = 200
  clearExternalRequestCache()
})

afterAll(async () => {
  if (server) await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  if (apiServer) await new Promise((resolve, reject) => {
    apiServer.close((error) => (error ? reject(error) : resolve()))
  })
  await mongoose.disconnect()
  if (mongo) await mongo.stop()
})

async function createPendingRequest() {
  const external = {
    documento: 'approval-test',
    fecha: '15/10/2026',
    cliente: 'CLI-TEST',
    nombre: 'Cliente de prueba',
    bodegaorigen: 'Bodega A',
    bodegadestino: 'Bodega B',
    modelo: 'M-1',
    descripcion: 'Producto de prueba',
    cantidad: '2',
  }
  externalRows.GT = [external, {
    documento: 'old-test',
    fecha: '30/09/2026',
    nombre: 'Registro fuera de rango',
  }]
  return issueApprovalToken({
    externalId: 'GT-approval-test',
    country: 'GT',
  }, 'gerente@example.com')
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

describe('aprobacion por correo y dashboard', () => {
  it('solo lista solicitudes desde SYNC_MIN_DATE aunque queden datos antiguos en MongoDB', async () => {
    await createPendingRequest()
    await Request.create({
      externalId: 'GT-old-test',
      country: 'GT',
    })

    const response = await fetch(`${base}/api/requests`, { headers: managerHeaders() })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.total).toBe(1)
    expect(payload.data.map((item) => item.externalId)).toEqual(['GT-approval-test'])
    expect(payload.data[0].clienteNombre).toBe('Cliente de prueba')
    const savedState = await Request.findOne({ externalId: 'GT-approval-test' }).lean()
    expect(savedState).not.toHaveProperty('clienteNombre')
    expect(savedState).not.toHaveProperty('items')
  })

  it('no presenta como actuales los datos guardados si la API falla', async () => {
    await createPendingRequest()
    const initial = await fetch(`${base}/api/requests`, { headers: managerHeaders() })
    expect(initial.status).toBe(200)
    apiFailureStatus = 503

    const forcedRefresh = await fetch(`${base}/api/requests/sync`, {
      method: 'POST',
      headers: { ...managerHeaders(), 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(forcedRefresh.status).toBe(502)

    const response = await fetch(`${base}/api/requests`, { headers: managerHeaders() })
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toContain('HTTP 503')
  })

  it('oculta localmente una solicitud sin dejar de consultar la API', async () => {
    await createPendingRequest()
    const hidden = await fetch(`${base}/api/requests/GT-approval-test`, {
      method: 'DELETE',
      headers: managerHeaders(),
    })
    const hiddenRead = await fetch(`${base}/api/requests/GT-approval-test`, {
      headers: managerHeaders(),
    })
    const restored = await fetch(`${base}/api/requests/GT-approval-test/restore`, {
      method: 'POST',
      headers: managerHeaders(),
    })
    const visibleRead = await fetch(`${base}/api/requests/GT-approval-test`, {
      headers: managerHeaders(),
    })

    expect(hidden.status).toBe(200)
    expect(hiddenRead.status).toBe(404)
    expect(restored.status).toBe(200)
    expect(visibleRead.status).toBe(200)
    expect((await visibleRead.json()).clienteNombre).toBe('Cliente de prueba')
  })

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

  it('no acepta rechazos por correo sin justificación', async () => {
    const issued = await createPendingRequest()
    const response = await fetch(`${base}/api/requests/approve/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: issued.token,
        status: 'No Aprobada',
        motivo: '   ',
      }),
    })
    const html = await response.text()
    const saved = await Request.findOne({ externalId: 'GT-approval-test' }).lean()

    expect(response.status).toBe(400)
    expect(html).toContain('Escribe una justificación para rechazar la solicitud.')
    expect(saved.localStatus).toBe('Pendiente')
    expect(saved.approvalTokenUsedAt).toBeNull()
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
    expect(payload.data[0].documento).toBe('approval-test')
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
    await Request.updateOne(
      { externalId: 'GT-approval-test' },
      { $set: { approvalDeferredBy: 'otra-persona@example.com' } },
    )
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
