import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

function makeSTR(overrides = {}) {
  return {
    id: 'GT-26001',
    documento: '26001',
    pais: 'GT',
    cliente: 'Distribuidora Central',
    clienteCodigo: 'CLI-1042',
    clienteIniciales: 'DC',
    detalleSTR: '12 x Monitor LED 24"',
    ruta: 'Bodega Guatemala → Bodega Villa Nueva',
    bodegaOrigen: 'Bodega Guatemala',
    bodegaDestino: 'Bodega Villa Nueva',
    tipoSolicitud: 'COM',
    estado: 'Pendiente',
    fecha: '24 oct 2026',
    items: [],
    totalLineas: 1,
    totalCantidad: 12,
    internalNotes: '',
    ...overrides,
  }
}

const getSTRs = vi.fn(async () => [makeSTR()])
const sendApprovalEmail = vi.fn(async () => ({ ok: true }))

vi.mock('./services/strService', () => ({
  getToken: () => 'token-de-prueba',
  clearSession: vi.fn(),
  login: vi.fn(),
  getSTRs: (...args) => getSTRs(...args),
  sendApprovalEmail: (...args) => sendApprovalEmail(...args),
  updateLocalStatus: vi.fn(),
  syncNow: vi.fn(),
  getUsers: vi.fn(async () => []),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  toggleUser: vi.fn(),
}))

// jsdom no trae WebAudio, y de todas formas el test mira la UI, no el sonido.
const playChime = vi.fn()
vi.mock('./services/notificationSound', () => ({
  playChime: (...args) => playChime(...args),
  isMuted: () => false,
  setMuted: vi.fn(),
}))

const { default: App } = await import('./App.jsx')

describe('envío a aprobación', () => {
  beforeEach(() => {
    localStorage.setItem('strflow-user', JSON.stringify({
      email: 'general@red.com', name: 'General', role: 'GERENTE_GENERAL', country: null,
    }))
    getSTRs.mockImplementation(async () => [makeSTR()])
    sendApprovalEmail.mockImplementation(async () => ({ ok: true }))
    playChime.mockClear()
  })

  afterEach(cleanup)

  it('muestra la pantalla de éxito al enviar el correo', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/Mostrando/)

    await user.click(screen.getByRole('button', { name: /Aprobación/ }))
    await user.type(screen.getByLabelText(/Información adicional/), 'Urge para el lunes')
    await user.click(screen.getByRole('button', { name: /Enviar a gerente/ }))

    expect(await screen.findByText('El correo se ha enviado con éxito')).toBeTruthy()
    expect(sendApprovalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'GT-26001' }),
      'Urge para el lunes',
    )
    // Y además queda el aviso en el centro de notificaciones.
    expect(screen.getByText('Correo enviado')).toBeTruthy()
  })

  it('deja el formulario abierto y avisa del error si el envío falla', async () => {
    sendApprovalEmail.mockImplementation(async () => { throw new Error('Brevo rechazó el correo') })

    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/Mostrando/)

    await user.click(screen.getByRole('button', { name: /Aprobación/ }))
    await user.click(screen.getByRole('button', { name: /Enviar a gerente/ }))

    // El error se avisa en dos lugares: junto al formulario y en el centro
    // de notificaciones, asi que hay dos role="alert".
    expect(await screen.findAllByText('Brevo rechazó el correo')).toHaveLength(2)
    expect(screen.getAllByRole('alert')).toHaveLength(2)
    expect(screen.queryByText('El correo se ha enviado con éxito')).toBeNull()
    expect(screen.getByText('No se pudo enviar')).toBeTruthy()
    // El formulario sigue en pie para reintentar.
    expect(screen.getByLabelText(/Información adicional/)).toBeTruthy()
  })
})

describe('notificación de aprobación', () => {
  beforeEach(() => {
    localStorage.setItem('strflow-user', JSON.stringify({
      email: 'general@red.com', name: 'General', role: 'GERENTE_GENERAL', country: null,
    }))
    playChime.mockClear()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('avisa con sonido cuando una solicitud pasa a Aprobada', async () => {
    getSTRs.mockImplementation(async () => [makeSTR()])

    render(<App />)
    await screen.findByText(/Mostrando/)

    // La primera relectura solo toma la foto del estado actual: no debe avisar
    // de lo que ya estaba decidido al abrir la app.
    await act(async () => { await vi.advanceTimersByTimeAsync(6100) })
    expect(screen.queryByText('Solicitud aprobada')).toBeNull()

    // Ahora llega la decisión tomada desde el correo.
    getSTRs.mockImplementation(async () => [makeSTR({
      estado: 'Aprobada', decididoPor: 'eduardo@red.com', motivo: 'Stock confirmado con bodega.',
    })])
    await act(async () => { await vi.advanceTimersByTimeAsync(6100) })

    // No es un toast de esquina: toma la pantalla y exige un acuse.
    const alerta = screen.getByRole('alertdialog')
    expect(within(alerta).getByText('Solicitud aprobada')).toBeTruthy()
    expect(within(alerta).getByText(/Pendiente → Aprobada/)).toBeTruthy()
    expect(within(alerta).getByText('eduardo@red.com')).toBeTruthy()
    expect(within(alerta).getByText('Stock confirmado con bodega.')).toBeTruthy()
    expect(playChime).toHaveBeenCalledWith('success')
  })

  it('marca la campana con el contador de avisos sin leer', async () => {
    getSTRs.mockImplementation(async () => [makeSTR()])

    render(<App />)
    await screen.findByText(/Mostrando/)
    await act(async () => { await vi.advanceTimersByTimeAsync(6100) })

    getSTRs.mockImplementation(async () => [makeSTR({ estado: 'No Aprobada' })])
    await act(async () => { await vi.advanceTimersByTimeAsync(6100) })

    expect(screen.getByText('Solicitud no aprobada')).toBeTruthy()
    expect(screen.getByLabelText('1 notificaciones sin leer')).toBeTruthy()
  })
})

describe('historial de notificaciones', () => {
  beforeEach(() => {
    localStorage.setItem('strflow-user', JSON.stringify({
      email: 'general@red.com', name: 'General', role: 'GERENTE_GENERAL', country: null,
    }))
    getSTRs.mockImplementation(async () => [makeSTR()])
    sendApprovalEmail.mockImplementation(async () => ({ ok: true }))
    playChime.mockClear()
  })

  afterEach(cleanup)

  it('arranca vacío y lo dice', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/Mostrando/)

    await user.click(screen.getByLabelText('Notificaciones'))

    const panel = screen.getByRole('dialog', { name: 'Historial de notificaciones' })
    expect(within(panel).getByText('Sin notificaciones')).toBeTruthy()
    expect(within(panel).getByText('Todo al día')).toBeTruthy()
  })

  it('guarda lo enviado y lo marca como leído al abrir el panel', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/Mostrando/)

    await user.click(screen.getByRole('button', { name: /Aprobación/ }))
    await user.click(screen.getByRole('button', { name: /Enviar a gerente/ }))
    await screen.findByText('El correo se ha enviado con éxito')

    // El aviso quedó sin leer y la campana lo refleja.
    const bell = screen.getByLabelText('1 notificaciones sin leer')
    expect(bell.textContent).toContain('1')

    await user.click(bell)
    const panel = screen.getByRole('dialog', { name: 'Historial de notificaciones' })
    expect(within(panel).getByText('Correo enviado')).toBeTruthy()
    expect(within(panel).getByText(/GT-26001 salió a aprobación/)).toBeTruthy()

    // Abrirlo cuenta como haberlo visto.
    expect(screen.getByLabelText('Notificaciones')).toBeTruthy()
    expect(within(panel).getByText('Todo al día')).toBeTruthy()
  })

  it('se cierra con Escape y se puede limpiar', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/Mostrando/)

    await user.click(screen.getByRole('button', { name: /Aprobación/ }))
    await user.click(screen.getByRole('button', { name: /Enviar a gerente/ }))
    await screen.findByText('El correo se ha enviado con éxito')

    await user.click(screen.getByLabelText('1 notificaciones sin leer'))
    expect(screen.getByRole('dialog', { name: 'Historial de notificaciones' })).toBeTruthy()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Historial de notificaciones' })).toBeNull()

    await user.click(screen.getByLabelText('Notificaciones'))
    await user.click(screen.getByRole('button', { name: 'Limpiar' }))
    const panel = screen.getByRole('dialog', { name: 'Historial de notificaciones' })
    expect(within(panel).getByText('Sin notificaciones')).toBeTruthy()
  })
})

describe('aviso prioritario a pantalla completa', () => {
  beforeEach(() => {
    localStorage.setItem('strflow-user', JSON.stringify({
      email: 'general@red.com', name: 'General', role: 'GERENTE_GENERAL', country: null,
    }))
    playChime.mockClear()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  async function provocarDecision(estado) {
    getSTRs.mockImplementation(async () => [makeSTR()])
    render(<App />)
    await screen.findByText(/Mostrando/)
    await act(async () => { await vi.advanceTimersByTimeAsync(6100) })

    getSTRs.mockImplementation(async () => [makeSTR({ estado })])
    await act(async () => { await vi.advanceTimersByTimeAsync(6100) })
  }

  it('no se cierra solo: espera el acuse del usuario', async () => {
    await provocarDecision('Aprobada')
    expect(screen.getByRole('alertdialog')).toBeTruthy()

    // Pasa de largo cualquier duracion de toast y sigue ahi.
    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
    expect(screen.getByRole('alertdialog')).toBeTruthy()
  })

  it('se cierra con Entendido y queda en el historial', async () => {
    await provocarDecision('Aprobada')

    const alerta = screen.getByRole('alertdialog')
    await act(async () => { within(alerta).getByRole('button', { name: 'Entendido' }).click() })
    expect(screen.queryByRole('alertdialog')).toBeNull()

    await act(async () => { screen.getByLabelText('1 notificaciones sin leer').click() })
    const panel = screen.getByRole('dialog', { name: 'Historial de notificaciones' })
    expect(within(panel).getByText('Solicitud aprobada')).toBeTruthy()
  })

  it('distingue el rechazo del visto bueno', async () => {
    await provocarDecision('No Aprobada')

    const alerta = screen.getByRole('alertdialog')
    expect(within(alerta).getByText('Solicitud no aprobada')).toBeTruthy()
    expect(alerta.className).toContain('is-rejected')
    // El chime tambien cambia: no se celebra un rechazo.
    expect(playChime).toHaveBeenCalledWith('error')
  })
})

describe('botón de aprobación según el estado', () => {
  beforeEach(() => {
    localStorage.setItem('strflow-user', JSON.stringify({
      email: 'general@red.com', name: 'General', role: 'GERENTE_GENERAL', country: null,
    }))
  })

  afterEach(cleanup)

  function fila() {
    return screen.getAllByRole('row')[1]
  }

  it('lo oculta cuando ya está aprobada', async () => {
    getSTRs.mockImplementation(async () => [makeSTR({ estado: 'Aprobada' })])
    render(<App />)
    await screen.findByText(/Mostrando/)

    expect(within(fila()).queryByRole('button', { name: /Aprobación/ })).toBeNull()
    // Ver detalles sigue disponible.
    expect(within(fila()).getByRole('button', { name: /Ver detalles/ })).toBeTruthy()
  })

  it('lo mantiene en pendientes y en no aprobadas', async () => {
    getSTRs.mockImplementation(async () => [makeSTR({ estado: 'Pendiente' })])
    const { unmount } = render(<App />)
    await screen.findByText(/Mostrando/)
    expect(within(fila()).getByRole('button', { name: /Aprobación/ })).toBeTruthy()
    unmount()

    getSTRs.mockImplementation(async () => [makeSTR({ estado: 'No Aprobada' })])
    render(<App />)
    await screen.findByText(/Mostrando/)
    expect(within(fila()).getByRole('button', { name: /Aprobación/ })).toBeTruthy()
  })
})

describe('detalle de la decisión', () => {
  beforeEach(() => {
    localStorage.setItem('strflow-user', JSON.stringify({
      email: 'general@red.com', name: 'General', role: 'GERENTE_GENERAL', country: null,
    }))
  })

  afterEach(cleanup)

  const decidida = {
    estado: 'Aprobada',
    decididoPor: 'eduardo@red.com',
    decididoVia: 'correo',
    decididoEn: '2026-10-27T18:30:00.000Z',
    motivo: 'Stock confirmado con bodega.',
    usuarioSap: 'ESANCHEZ',
    estadoSap: 'ok',
  }

  it('no ofrece ver decisión en las pendientes', async () => {
    getSTRs.mockImplementation(async () => [makeSTR()])
    render(<App />)
    await screen.findByText(/Mostrando/)

    expect(screen.queryByRole('button', { name: /Ver decisión/ })).toBeNull()
  })

  it('muestra quién decidió, con qué usuario de SAP y por qué', async () => {
    const user = userEvent.setup()
    getSTRs.mockImplementation(async () => [makeSTR(decidida)])
    render(<App />)
    await screen.findByText(/Mostrando/)

    await user.click(screen.getByRole('button', { name: /Ver decisión/ }))

    const modal = screen.getByRole('dialog', { name: /GT-26001/ })
    expect(within(modal).getByText('eduardo@red.com')).toBeTruthy()
    expect(within(modal).getByText('ESANCHEZ')).toBeTruthy()
    expect(within(modal).getByText('Registrado en SAP')).toBeTruthy()
    expect(within(modal).getByText('Stock confirmado con bodega.')).toBeTruthy()
  })

  it('lo dice cuando no se escribió motivo', async () => {
    const user = userEvent.setup()
    getSTRs.mockImplementation(async () => [makeSTR({ ...decidida, motivo: '' })])
    render(<App />)
    await screen.findByText(/Mostrando/)

    await user.click(screen.getByRole('button', { name: /Ver decisión/ }))
    expect(screen.getByText('No se escribió un motivo para esta decisión.')).toBeTruthy()
  })
})
