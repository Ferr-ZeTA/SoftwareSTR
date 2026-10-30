import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// La capa de servicios se sustituye: el test mira la UI, no la red.
const STRS = Array.from({ length: 25 }, (unused, index) => {
  const number = index + 1
  const country = number % 2 === 1 ? 'GT' : 'SV'
  return {
    id: `${country}-${1000 + number}`,
    documento: String(1000 + number),
    pais: country,
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
  decideApproval: vi.fn(async (id, estado, motivo) => ({
    ...STRS.find((str) => str.id === id),
    estado,
    motivo,
  })),
  deferApproval: vi.fn(async (id) => ({
    ...STRS.find((str) => str.id === id),
    aprobacionPospuestaEn: new Date().toISOString(),
    aprobacionPospuestaPor: 'general@red.com',
  })),
  restoreApproval: vi.fn(async (id) => ({
    ...STRS.find((str) => str.id === id),
    aprobacionPospuestaEn: null,
    aprobacionPospuestaPor: null,
  })),
  updateLocalStatus: vi.fn(),
  syncNow: vi.fn(),
  getUsers: vi.fn(async () => [{
    _id: 'user-1',
    name: 'Juanito Juan',
    email: 'juan@red.com',
    role: 'GERENTE_REGIONAL',
    country: 'SV',
    active: true,
  }]),
  createUser: vi.fn(),
  deleteUser: vi.fn(async () => {}),
  toggleUser: vi.fn(),
}))

const { default: App } = await import('./App.jsx')
const { decideApproval, deleteUser, deferApproval, sendApprovalEmail, restoreApproval } = await import('./services/strService')

function rowIds() {
  const rows = screen.getAllByRole('row').slice(1) // sin la cabecera
  return rows.map((row) => within(row).getAllByRole('cell')[0].textContent)
}

describe('paginación de la tabla', () => {
  beforeEach(() => {
    STRS.forEach((str) => {
      delete str.aprobacionEnviada
      delete str.aprobacionPospuestaEn
      delete str.aprobacionPospuestaPor
    })
    decideApproval.mockClear()
    deferApproval.mockClear()
    restoreApproval.mockClear()
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

  it('muestra el inicio de sesión cuando no hay usuario guardado', async () => {
    localStorage.removeItem('strflow-user')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeTruthy()
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

  it('filtra por país en la vista general y actualiza conteos y resultados', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/Mostrando/)

    await user.selectOptions(screen.getByLabelText('Filtrar por país'), 'SV')

    expect(rowIds()).toHaveLength(10)
    expect(rowIds()[0]).toContain('SV-1002')
    expect(screen.getByText('12 resultados')).toBeTruthy()
    const statusFilters = screen.getByRole('group', { name: 'Filtrar por estado' })
    expect(within(statusFilters).getByRole('button', { name: /Pendiente/ }).textContent).toContain('12')
  })

  it('muestra la bandeja de aprobaciones con el detalle y permite decidir desde el dashboard', async () => {
    const user = userEvent.setup()
    STRS[0].aprobacionEnviada = true
    STRS[0].items = [{ modelo: 'M-1', descripcion: 'Producto de prueba', cantidad: 5 }]
    render(<App />)

    await user.click(screen.getByRole('link', { name: /Aprobaciones/ }))

    expect(await screen.findByRole('heading', { name: /Solicitudes de aprobación/ })).toBeTruthy()
    expect(screen.getByText('Producto de prueba')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Aprobar/ }))

    expect(decideApproval).toHaveBeenCalledWith('GT-1001', 'Aprobada', '')
    expect(await screen.findByText(/No tienes aprobaciones pendientes/)).toBeTruthy()
  })

  it('guarda las solicitudes pospuestas en Ver facturas y permite devolverlas a la bandeja', async () => {
    const user = userEvent.setup()
    STRS[0].aprobacionEnviada = true
    render(<App />)

    await user.click(screen.getByRole('link', { name: /Aprobaciones/ }))
    await screen.findByRole('heading', { name: /Solicitudes de aprobación/ })
    await user.click(screen.getByRole('button', { name: /Ver más tarde/ }))
    expect(deferApproval).toHaveBeenCalledWith('GT-1001')

    await user.click(screen.getByRole('link', { name: /Ver facturas/ }))
    expect(await screen.findByRole('heading', { name: 'Ver facturas' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /GT-1001/ })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Regresar a aprobaciones/ }))
    expect(restoreApproval).toHaveBeenCalledWith('GT-1001')
    await user.click(screen.getByRole('link', { name: /Aprobaciones/ }))
    expect(await screen.findByRole('button', { name: /Ver más tarde/ })).toBeTruthy()
  })

  it('muestra errores al enviar el correo sin desmontar la aplicación', async () => {
    const user = userEvent.setup()
    sendApprovalEmail.mockRejectedValueOnce(
      new Error('Brevo rechazó el envío (HTTP 400): sender is not verified'),
    )
    render(<App />)
    await screen.findByText(/Mostrando/)

    await user.click(screen.getAllByRole('button', { name: /Aprobación/ })[0])
    await user.click(screen.getByRole('button', { name: /Enviar a gerente/ }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('alert').textContent).toMatch(/sender is not verified/)
    expect(screen.getByRole('heading', { name: 'Solicitudes STR' })).toBeTruthy()
    expect(dialog).toBeTruthy()
  })

  it('no muestra el selector de país a gerentes regionales', async () => {
    localStorage.setItem('strflow-user', JSON.stringify({
      email: 'regional@red.com',
      name: 'Regional',
      role: 'GERENTE_REGIONAL',
      country: 'SV',
    }))
    render(<App />)

    await screen.findByText(/Mostrando/)
    expect(screen.queryByLabelText('Filtrar por país')).toBeNull()
    expect(rowIds()[0]).toContain('SV-1002')
  })

  it('abre gestión de usuarios y oculta opciones sin implementar', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('link', { name: 'Usuarios' }))

    expect(await screen.findByRole('heading', { name: 'Usuarios del sistema' })).toBeTruthy()
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

  it('confirma la eliminación con un diálogo de la aplicación', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('link', { name: 'Usuarios' }))
    await screen.findByRole('heading', { name: 'Usuarios del sistema' })
    await screen.findByText(/juan@red\.com/)
    await user.click(screen.getByRole('button', { name: /Eliminar/ }))

    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText(/¿Seguro que quieres eliminar a/)).toBeTruthy()
    expect(within(dialog).getByText('juan@red.com')).toBeTruthy()
    expect(deleteUser).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(deleteUser).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /Eliminar/ }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Sí, eliminar' }))

    expect(deleteUser).toHaveBeenCalledWith('user-1')
    expect(await screen.findByText('Usuario juan@red.com eliminado.')).toBeTruthy()
  })
})
