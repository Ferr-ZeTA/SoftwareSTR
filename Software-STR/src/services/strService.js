const TOKEN_KEY = 'strflow-token'

export function getToken() {
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
    aprobacionEnviada: Boolean(request.approvalSentTo),
    aprobacionEnviadaA: request.approvalSentTo ?? null,
    aprobacionPospuestaEn: request.approvalDeferredAt ?? null,
    aprobacionPospuestaPor: request.approvalDeferredBy ?? null,
    historial: request.approvalHistory ?? [],
    // El motivo que escribio quien decidio, en el formulario del correo.
    motivo: request.approvalHistory?.[request.approvalHistory.length - 1]?.note ?? '',
    usuarioSap: request.sapAuthorizedBy ?? null,
    estadoSap: request.sapPushCode ?? null,
  }
}

// Trae todas las páginas. El backend tope es 200 por request.
export async function getSTRs() {
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
  return authFetch(`/api/requests/${encodeURIComponent(str.id)}/send-approval`, {
    method: 'POST',
    body: JSON.stringify({ additionalInfo }),
  })
}

// Cambio de estado local (no toca nada de lo que manda la API externa).
export async function updateLocalStatus(id, localStatus, internalNotes, note) {
  const body = { localStatus }
  if (internalNotes !== undefined) body.internalNotes = internalNotes
  if (note !== undefined) body.note = note
  const updated = await authFetch(`/api/requests/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  return adapt(updated)
}

export async function decideApproval(id, status, note) {
  const updated = await authFetch(`/api/requests/${encodeURIComponent(id)}/decide-approval`, {
    method: 'POST',
    body: JSON.stringify({ status, note }),
  })
  return adapt(updated)
}

export async function deferApproval(id) {
  const updated = await authFetch(`/api/requests/${encodeURIComponent(id)}/defer-approval`, {
    method: 'POST',
    body: '{}',
  })
  return adapt(updated)
}

export async function restoreApproval(id) {
  const updated = await authFetch(`/api/requests/${encodeURIComponent(id)}/restore-approval`, {
    method: 'POST',
    body: '{}',
  })
  return adapt(updated)
}

export async function syncNow() {
  return authFetch('/api/requests/sync', { method: 'POST', body: '{}' })
}

// --- Gestión de usuarios (solo GERENTE_GENERAL) ---
export async function getUsers() {
  return (await authFetch('/api/users')).data
}

export async function createUser(payload) {
  return authFetch('/api/users', { method: 'POST', body: JSON.stringify(payload) })
}

export async function deleteUser(id) {
  return authFetch(`/api/users/${id}`, { method: 'DELETE' })
}

export async function toggleUser(id, active) {
  return authFetch(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) })
}
