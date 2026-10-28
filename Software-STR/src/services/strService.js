const TOKEN_KEY = 'strflow-token'
const DEMO_USERS_KEY = 'strflow-demo-users'
const DEMO_USER = {
  _id: 'demo-global',
  email: 'demo@strflow.local',
  name: 'Usuario demo',
  role: 'GERENTE_GENERAL',
  country: null,
  active: true,
}

const DEMO_REQUESTS = [
  {
    externalId: 'GT-26001',
    documento: '26001',
    country: 'GT',
    fecha: '2026-10-24T00:00:00.000Z',
    clienteCodigo: 'CLI-1042',
    clienteNombre: 'Distribuidora Central',
    bodegaOrigen: 'Bodega Guatemala',
    bodegaDestino: 'Bodega Villa Nueva',
    tipoSolicitud: 'COM',
    items: [{ modelo: 'MOD-001', descripcion: 'Monitor LED 24"', cantidad: 12 }],
    totalLineas: 1,
    totalCantidad: 12,
    localStatus: 'Pendiente',
    internalNotes: '',
  },
  {
    externalId: 'SV-26002',
    documento: '26002',
    country: 'SV',
    fecha: '2026-10-23T00:00:00.000Z',
    clienteCodigo: 'CLI-2088',
    clienteNombre: 'Comercial El Pacifico',
    bodegaOrigen: 'Bodega San Salvador',
    bodegaDestino: 'Bodega Santa Ana',
    tipoSolicitud: 'URG',
    items: [
      { modelo: 'MOD-014', descripcion: 'Teclado inalámbrico', cantidad: 20 },
      { modelo: 'MOD-015', descripcion: 'Mouse inalámbrico', cantidad: 20 },
    ],
    totalLineas: 2,
    totalCantidad: 40,
    localStatus: 'Pendiente',
    internalNotes: '',
  },
  {
    externalId: 'GT-26003',
    documento: '26003',
    country: 'GT',
    fecha: '2026-10-22T00:00:00.000Z',
    clienteCodigo: 'CLI-3071',
    clienteNombre: 'Tecnologia del Norte',
    bodegaOrigen: 'Bodega Guatemala',
    bodegaDestino: 'Bodega Quetzaltenango',
    tipoSolicitud: 'COM',
    items: [{ modelo: 'MOD-021', descripcion: 'Impresora multifuncional', cantidad: 4 }],
    totalLineas: 1,
    totalCantidad: 4,
    localStatus: 'Pendiente',
    internalNotes: '',
  },
  {
    externalId: 'SV-26004',
    documento: '26004',
    country: 'SV',
    fecha: '2026-10-21T00:00:00.000Z',
    clienteCodigo: 'CLI-4110',
    clienteNombre: 'Almacenes del Sur',
    bodegaOrigen: 'Bodega San Salvador',
    bodegaDestino: 'Bodega San Miguel',
    tipoSolicitud: 'COM',
    items: [{ modelo: 'MOD-033', descripcion: 'Silla ergonómica', cantidad: 8 }],
    totalLineas: 1,
    totalCantidad: 8,
    localStatus: 'Pendiente',
    internalNotes: '',
  },
  {
    externalId: 'GT-26005',
    documento: '26005',
    country: 'GT',
    fecha: '2026-10-20T00:00:00.000Z',
    clienteCodigo: 'CLI-5199',
    clienteNombre: 'Servicios Empresariales',
    bodegaOrigen: 'Bodega Villa Nueva',
    bodegaDestino: 'Bodega Guatemala',
    tipoSolicitud: 'URG',
    items: [{ modelo: 'MOD-045', descripcion: 'Laptop empresarial', cantidad: 6 }],
    totalLineas: 1,
    totalCantidad: 6,
    localStatus: 'Pendiente',
    internalNotes: '',
  },
]

let demoRequests = DEMO_REQUESTS.map((request) => ({ ...request, items: [...request.items] }))

export function getToken() {
  if (isDemoMode()) return 'demo-token'

  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* localStorage bloqueado */ }
}

export function clearSession() {
  setToken(null)
}

export function isDemoMode() {
  return import.meta.env.VITE_DEMO_MODE !== 'false'
}

// Todas las llamadas protegidas pasan por aquí: adjuntan el JWT y detectan
// la sesión vencida.
async function authFetch(path, options = {}) {
  const token = getToken()
  if (!token) throw new Error('SESSION_EXPIRED')

  const response = await fetch(path, {
    ...options,
    headers: {
      ...options.headers,
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  if (response.status === 401) {
    clearSession()
    throw new Error('SESSION_EXPIRED')
  }

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `La API respondió ${response.status}`)
  return payload
}

function initials(name) {
  return String(name || '')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((word) => word[0]).join('').toUpperCase() || '--'
}

function formatDate(value) {
  if (!value) return 'Sin fecha'
  return new Date(value).toLocaleDateString('es-GT', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

// Adapta el documento de la API al vocabulario que ya usa la UI.
// La API de traslados no trae factura, monto ni responsable: esos campos
// simplemente no existen y la UI muestra los datos reales en su lugar.
function adapt(request) {
  const items = request.items ?? []
  // Resumen corto para la tabla: el detalle completo vive en el modal.
  const resumen = items.length
    ? (items.length === 1
        ? `${items[0].cantidad} x ${items[0].descripcion}`
        : `${items.length} artículos · ${request.totalCantidad} unidades`)
    : 'Sin líneas'

  return {
    id: request.externalId,
    documento: request.documento,
    pais: request.country,
    cliente: request.clienteNombre,
    clienteCodigo: request.clienteCodigo,
    clienteIniciales: initials(request.clienteNombre),
    detalleSTR: resumen,
    ruta: `${request.bodegaOrigen} → ${request.bodegaDestino}`,
    bodegaOrigen: request.bodegaOrigen,
    bodegaDestino: request.bodegaDestino,
    tipoSolicitud: request.tipoSolicitud,
    estado: request.localStatus,
    fecha: formatDate(request.fecha),
    fechaISO: request.fecha,
    items,
    totalLineas: request.totalLineas,
    totalCantidad: request.totalCantidad,
    internalNotes: request.internalNotes ?? '',
    decididoPor: request.approvalDecidedBy ?? null,
    decididoVia: request.approvalDecidedVia ?? null,
    decididoEn: request.approvalDecidedAt ?? null,
    historial: request.approvalHistory ?? [],
    // El motivo que escribio quien decidio, en el formulario del correo.
    motivo: request.approvalHistory?.[request.approvalHistory.length - 1]?.note ?? '',
    usuarioSap: request.sapAuthorizedBy ?? null,
    estadoSap: request.sapPushCode ?? null,
  }
}

// Trae todas las páginas. El backend tope es 200 por request.
export async function getSTRs() {
  if (isDemoMode()) {
    // Las decisiones tomadas desde el correo viven en el servidor (en memoria),
    // asi que hay que traerlas para que la tabla refleje lo que aprobo Eduardo.
    try {
      const response = await fetch('/api/requests/demo/decisions')
      if (response.ok) {
        const { data = [] } = await response.json()
        const byId = new Map(data.map((decision) => [decision.externalId, decision]))
        demoRequests = demoRequests.map((request) => {
          const decision = byId.get(request.externalId)
          if (!decision) return request
          return {
            ...request,
            localStatus: decision.localStatus,
            approvalDecidedBy: decision.decidedBy,
            approvalDecidedVia: 'correo',
            approvalDecidedAt: decision.decidedAt,
            sapAuthorizedBy: decision.sapUser,
            sapPushCode: decision.sapCode,
            approvalHistory: decision.motivo
              ? [{
                  status: decision.localStatus,
                  previousStatus: 'Pendiente',
                  by: decision.decidedBy,
                  via: 'correo',
                  at: decision.decidedAt,
                  note: decision.motivo,
                }]
              : [],
          }
        })
      }
    } catch { /* sin API: la demo sigue con lo que tiene en memoria */ }

    return demoRequests.map((request) => adapt(request))
  }

  const all = []
  let page = 1
  let pages = 1

  do {
    const payload = await authFetch(`/api/requests?limit=200&page=${page}`)
    all.push(...payload.data.map(adapt))
    pages = payload.pages || 1
    page += 1
  } while (page <= pages && page <= 50)

  return all
}

export async function login(email, password) {
  if (isDemoMode()) return DEMO_USER

  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Credenciales inválidas.')

  setToken(payload.token)
  return payload.user
}

export async function sendApprovalEmail(str, additionalInfo) {
  if (isDemoMode()) {
    const response = await fetch('/api/requests/demo/send-approval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request: str, additionalInfo }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || `La API respondió ${response.status}`)
    return payload
  }

  return authFetch(`/api/requests/${encodeURIComponent(str.id)}/send-approval`, {
    method: 'POST',
    body: JSON.stringify({ additionalInfo }),
  })
}

// Cambio de estado local (no toca nada de lo que manda la API externa).
export async function updateLocalStatus(id, localStatus, internalNotes) {
  if (isDemoMode()) {
    const request = demoRequests.find((item) => item.externalId === id)
    if (!request) throw new Error('Solicitud no encontrada.')
    request.localStatus = localStatus
    if (internalNotes !== undefined) request.internalNotes = internalNotes
    return adapt(request)
  }

  const body = { localStatus }
  if (internalNotes !== undefined) body.internalNotes = internalNotes
  const updated = await authFetch(`/api/requests/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  return adapt(updated)
}

export async function syncNow() {
  if (isDemoMode()) {
    return {
      startedAt: new Date(),
      finishedAt: new Date(),
      rows: demoRequests.length,
      documents: demoRequests.length,
      upserted: 0,
      modified: 0,
      matched: demoRequests.length,
      missing: 0,
      errors: [],
    }
  }

  return authFetch('/api/requests/sync', { method: 'POST', body: '{}' })
}

// --- Gestión de usuarios (solo GERENTE_GENERAL) ---
function getDemoUsers() {
  const stored = localStorage.getItem(DEMO_USERS_KEY)
  if (stored === null) return [{ ...DEMO_USER }]

  const users = JSON.parse(stored)
  if (!Array.isArray(users)) throw new Error('No se pudo leer la lista demo de usuarios.')
  return users
}

function saveDemoUsers(users) {
  localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(users))
}

export async function getUsers() {
  if (isDemoMode()) return getDemoUsers()

  return (await authFetch('/api/users')).data
}

export async function createUser(payload) {
  if (isDemoMode()) {
    const users = getDemoUsers()
    const email = String(payload.email || '').trim().toLowerCase()
    if (users.some((user) => user.email.toLowerCase() === email)) {
      throw new Error('Ya existe un usuario con ese correo.')
    }

    const user = {
      _id: `demo-${crypto.randomUUID()}`,
      name: String(payload.name || '').trim(),
      email,
      role: payload.role,
      country: payload.role === 'GERENTE_REGIONAL' ? payload.country : null,
      active: true,
    }
    users.unshift(user)
    saveDemoUsers(users)
    return user
  }

  return authFetch('/api/users', { method: 'POST', body: JSON.stringify(payload) })
}

export async function deleteUser(id) {
  if (isDemoMode()) {
    const users = getDemoUsers()
    const filtered = users.filter((user) => user._id !== id)
    if (filtered.length === users.length) throw new Error('Usuario no encontrado.')
    saveDemoUsers(filtered)
    return { deleted: true }
  }

  return authFetch(`/api/users/${id}`, { method: 'DELETE' })
}

export async function toggleUser(id, active) {
  if (isDemoMode()) {
    const users = getDemoUsers()
    const user = users.find((entry) => entry._id === id)
    if (!user) throw new Error('Usuario no encontrado.')
    user.active = active
    saveDemoUsers(users)
    return user
  }

  return authFetch(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) })
}
