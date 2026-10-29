// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { Request, SAP_PUSH_STATUS } from '../models/Request.js'
import { syncExternalApi } from './syncExternalApi.js'

let mongo

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri(), { dbName: 'strflow_external_sync_test' })
})

afterEach(async () => {
  await Request.deleteMany({})
})

afterAll(async () => {
  await mongoose.disconnect()
  if (mongo) await mongo.stop()
})

describe('syncExternalApi', () => {
  it('updates API-owned data without overwriting local decision or history', async () => {
    const decidedAt = new Date('2026-10-20T12:00:00.000Z')
    await Request.create({
      externalId: 'GT-7001',
      documento: '7001',
      country: 'GT',
      fecha: new Date('2026-10-21T00:00:00.000Z'),
      clienteNombre: 'Nombre anterior',
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
      sapPushStatus: SAP_PUSH_STATUS.NO_APLICA,
    })

    const summary = await syncExternalApi({
      countries: ['GT'],
      fetcher: async () => [{
        documento: '7001',
        fecha: '24/10/2026',
        cliente: 'CLI-7001',
        nombre: 'Nombre actualizado desde API',
        bodegaorigen: 'Bodega A',
        bodegadestino: 'Bodega B',
        tiposolicitud: 'COM',
        modelo: 'M-1',
        descripcion: 'Producto actualizado',
        cantidad: '4',
      }],
    })
    const saved = await Request.findOne({ externalId: 'GT-7001' }).lean()

    expect(summary.errors).toEqual([])
    expect(saved).toMatchObject({
      clienteCodigo: 'CLI-7001',
      clienteNombre: 'Nombre actualizado desde API',
      localStatus: 'Aprobada',
      internalNotes: 'Nota local que debe conservarse',
      approvalDecidedBy: 'gerente@example.com',
      sapPushStatus: SAP_PUSH_STATUS.NO_APLICA,
    })
    expect(saved.approvalDecidedAt.toISOString()).toBe(decidedAt.toISOString())
    expect(saved.approvalHistory).toHaveLength(1)
    expect(saved.approvalHistory[0].note).toBe('Autorizado')
    expect(saved.items).toEqual([{
      modelo: 'M-1',
      descripcion: 'Producto actualizado',
      cantidad: 4,
    }])
  })

  it('inserts a newly received API request as pending', async () => {
    await syncExternalApi({
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

    const saved = await Request.findOne({ externalId: 'SV-8001' }).lean()
    expect(saved).toMatchObject({
      localStatus: 'Pendiente',
      approvalHistory: [],
      deletedLocally: false,
      missingFromApi: false,
    })
  })
})
