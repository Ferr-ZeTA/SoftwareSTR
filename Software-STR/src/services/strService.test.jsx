import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createUser,
  deleteUser,
  getSTRs,
  getUsers,
  login,
  sendApprovalEmail,
  syncNow,
  toggleUser,
  updateLocalStatus,
} from './strService'

const response = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
})

describe('servicio conectado a la API', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('inicia sesión mediante la API y persiste el token real', async () => {
    fetch.mockResolvedValue(response({
      token: 'jwt-real',
      user: { email: 'gerente@example.com', role: 'GERENTE_GENERAL' },
    }))

    await expect(login('gerente@example.com', 'password')).resolves.toMatchObject({
      email: 'gerente@example.com',
    })
    expect(fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'gerente@example.com', password: 'password' }),
    }))
    expect(localStorage.getItem('strflow-token')).toBe('jwt-real')
  })

  it('carga solicitudes reales y adapta los datos de la API', async () => {
    localStorage.setItem('strflow-token', 'jwt-real')
    fetch.mockResolvedValue(response({
      data: [{
        externalId: 'GT-123',
        documento: '123',
        country: 'GT',
        fecha: '2026-10-24T00:00:00.000Z',
        clienteNombre: 'Cliente real',
        clienteCodigo: 'CLI-1',
        bodegaOrigen: 'Bodega A',
        bodegaDestino: 'Bodega B',
        tipoSolicitud: 'COM',
        items: [{ modelo: 'M1', descripcion: 'Producto', cantidad: 2 }],
        totalLineas: 1,
        totalCantidad: 2,
        localStatus: 'Pendiente',
      }],
      pages: 1,
    }))

    const [request] = await getSTRs()

    expect(request).toMatchObject({
      id: 'GT-123',
      cliente: 'Cliente real',
      detalleSTR: '2 x Producto',
      estado: 'Pendiente',
    })
    expect(fetch).toHaveBeenCalledWith('/api/requests?limit=200&page=1', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer jwt-real' }),
    }))
  })

  it('usa la API real para aprobaciones, cambios, sincronización y usuarios', async () => {
    localStorage.setItem('strflow-token', 'jwt-real')
    fetch
      .mockResolvedValueOnce(response({ sent: true }))
      .mockResolvedValueOnce(response({ externalId: 'GT-123', localStatus: 'Aprobada' }))
      .mockResolvedValueOnce(response({ rows: 1 }))
      .mockResolvedValueOnce(response({ data: [{ _id: 'user-1' }] }))
      .mockResolvedValueOnce(response({ _id: 'user-2' }))
      .mockResolvedValueOnce(response({ deleted: true }))
      .mockResolvedValueOnce(response({ _id: 'user-1', active: false }))

    await sendApprovalEmail({ id: 'GT-123' }, 'Revisar traslado')
    await updateLocalStatus('GT-123', 'Aprobada')
    await syncNow()
    await getUsers()
    await createUser({ email: 'new@example.com' })
    await deleteUser('user-2')
    await toggleUser('user-1', false)

    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      '/api/requests/GT-123/send-approval',
      '/api/requests/GT-123',
      '/api/requests/sync',
      '/api/users',
      '/api/users',
      '/api/users/user-2',
      '/api/users/user-1',
    ])
    expect(fetch).toHaveBeenCalledTimes(7)
  })

  it('no usa rutas protegidas si no hay sesión', async () => {
    await expect(getUsers()).rejects.toThrow('SESSION_EXPIRED')
    expect(fetch).not.toHaveBeenCalled()
  })
})
