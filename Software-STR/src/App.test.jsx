import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// La capa de servicios se sustituye: el test mira la UI, no la red.
const STRS = Array.from({ length: 25 }, (unused, index) => {
  const number = index + 1
  return {
    id: `GT-${1000 + number}`,
    documento: String(1000 + number),
    pais: 'GT',
    cliente: `Cliente ${number}`,
    clienteCodigo: `CL${number}`,
    clienteIniciales: 'CL',
    detalleSTR: '2 artículos · 5 unidades',
    ruta: 'B80 → B90',
    bodegaOrigen: 'B80',
    bodegaDestino: 'B90',
    tipoSolicitud: 'COM',
    estado: 'Pendiente',
    fecha: '01 oct 2026',
    items: [],
    totalLineas: 2,
    totalCantidad: 5,
    internalNotes: '',
  }
})

vi.mock('./services/strService', () => ({
  getToken: () => 'token-de-prueba',
  clearSession: vi.fn(),
  login: vi.fn(),
  getSTRs: vi.fn(async () => STRS),
  sendApprovalEmail: vi.fn(),
  updateLocalStatus: vi.fn(),
  syncNow: vi.fn(),
  getUsers: vi.fn(async () => []),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  toggleUser: vi.fn(),
  isDemoMode: () => true,
}))

const { default: App } = await import('./App.jsx')

function rowIds() {
  const rows = screen.getAllByRole('row').slice(1) // sin la cabecera
  return rows.map((row) => within(row).getAllByRole('cell')[0].textContent)
}

describe('paginación de la tabla', () => {
  beforeEach(() => {
    localStorage.setItem('strflow-user', JSON.stringify({
      email: 'general@red.com', name: 'General', role: 'GERENTE_GENERAL', country: null,
    }))
  })

  afterEach(cleanup)

  it('muestra 10 filas y avanza con el botón siguiente', async () => {
    const user = userEvent.setup()
    render(<App />)

    await screen.findByText(/Mostrando/)
    expect(rowIds()).toHaveLength(10)
    expect(rowIds()[0]).toContain('GT-1001')

    const next = screen.getByLabelText('Página siguiente')
    expect(next.disabled).toBe(false)

    await user.click(next)
    expect(rowIds()).toHaveLength(10)
    expect(rowIds()[0]).toContain('GT-1011')

    await user.click(next)
    expect(rowIds()[0]).toContain('GT-1021')
    expect(rowIds()).toHaveLength(5)
    expect(next.disabled).toBe(true)
  })

  it('retrocede y salta por número de página', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/Mostrando/)

    await user.click(screen.getByRole('button', { name: '3' }))
    expect(rowIds()[0]).toContain('GT-1021')

    await user.click(screen.getByLabelText('Página anterior'))
    expect(rowIds()[0]).toContain('GT-1011')

    await user.click(screen.getByLabelText('Primera página'))
    expect(rowIds()[0]).toContain('GT-1001')
  })

  it('vuelve a la página 1 al filtrar', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/Mostrando/)

    await user.click(screen.getByLabelText('Página siguiente'))
    expect(rowIds()[0]).toContain('GT-1011')

    await user.type(screen.getByLabelText('Buscar por ID de solicitud'), '1023')
    expect(rowIds()).toHaveLength(1)
    expect(rowIds()[0]).toContain('GT-1023')
  })

  it('abre gestión de usuarios y oculta opciones sin implementar', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('link', { name: 'Usuarios' }))

    expect(await screen.findByRole('heading', { name: 'Usuarios del sistema' })).toBeTruthy()
    expect(screen.getByText(/los cambios se guardan en este navegador/)).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Clientes' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Configuración' })).toBeNull()
  })

  it('permite crear usuarios desde la vista de administración', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('link', { name: 'Usuarios' }))
    await user.type(screen.getByPlaceholderText('Ana Pérez'), 'Ana Pérez')
    await user.type(screen.getByPlaceholderText('ana@red.com'), 'ana@red.com')
    await user.type(screen.getByPlaceholderText('Mínimo 8 caracteres'), 'password-seguro')
    await user.click(screen.getByRole('button', { name: 'Crear usuario' }))

    expect(await screen.findByText('Usuario ana@red.com creado correctamente.')).toBeTruthy()
  })
})
