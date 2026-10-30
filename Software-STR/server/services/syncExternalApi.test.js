// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { Request } from '../models/Request.js'
import { syncExternalApi } from './syncExternalApi.js'

let mongo

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri(), { dbName: 'strflow_external_api_test' })
})

afterEach(async () => {
  await Request.deleteMany({})
})

afterAll(async () => {
  await mongoose.disconnect()
  if (mongo) await mongo.stop()
})

describe('syncExternalApi', () => {
  it('returns live API requests without overwriting or storing operational data', async () => {
    const decidedAt = new Date('2026-10-20T12:00:00.000Z')
    await Request.create({
      externalId: 'GT-7001',
      country: 'GT',
      localStatus: 'Aprobada',
      internalNotes: 'Nota local que debe conservarse',
      approvalDecidedAt: decidedAt,
      approvalDecidedBy: 'gerente@example.com',
      approvalDecidedVia: 'correo',
      approvalHistory: [{
        status: 'Aprobada',
        previousStatus: 'Pendiente',
        by: 'gerente@example.com',
        via: 'correo',
        at: decidedAt,
        note: 'Autorizado',
      }],
    })

    const result = await syncExternalApi({
      countries: ['GT'],
      fetcher: async () => [{
        documento: '7001',
        fecha: '24/10/2026',
        cliente: 'CLI-7001',
        nombre: 'Nombre recibido de API',
        bodegaorigen: 'Bodega A',
        bodegadestino: 'Bodega B',
        tiposolicitud: 'COM',
        modelo: 'M-1',
        descripcion: 'Producto de API',
        cantidad: '4',
      }],
    })
    const saved = await Request.findOne({ externalId: 'GT-7001' }).lean()

    expect(result.errors).toEqual([])
    expect(result.requests).toHaveLength(1)
    expect(result.requests[0]).toMatchObject({
      externalId: 'GT-7001',
      clienteCodigo: 'CLI-7001',
      clienteNombre: 'Nombre recibido de API',
      items: [{ modelo: 'M-1', descripcion: 'Producto de API', cantidad: 4 }],
    })
    expect(saved).toMatchObject({
      country: 'GT',
      localStatus: 'Aprobada',
      internalNotes: 'Nota local que debe conservarse',
      approvalDecidedBy: 'gerente@example.com',
    })
    expect(saved.approvalDecidedAt.toISOString()).toBe(decidedAt.toISOString())
    expect(saved.approvalHistory).toHaveLength(1)
    expect(saved).not.toHaveProperty('clienteNombre')
    expect(saved).not.toHaveProperty('items')
  })

  it('does not create MongoDB records for new API requests', async () => {
    const result = await syncExternalApi({
      countries: ['SV'],
      fetcher: async () => [{
        documento: '8001',
        fecha: '25/10/2026',
        nombre: 'Nuevo traslado',
        modelo: 'M-2',
        descripcion: 'Producto nuevo',
        cantidad: '1',
      }],
    })

    expect(result.requests.map((item) => item.externalId)).toEqual(['SV-8001'])
    expect(await Request.countDocuments({})).toBe(0)
  })
})
