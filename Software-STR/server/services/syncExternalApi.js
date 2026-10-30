const API_BASE = () => process.env.EXTERNAL_API_URL
  || 'https://sapapi.red.com.sv/api/Procesos/solicitudtraslado'
const COUNTRIES = ['GT', 'SV']
const CACHE_TTL_MS = 15_000
const countryCache = new Map()

export const MIN_DATE = new Date(process.env.SYNC_MIN_DATE || '2026-10-01T00:00:00Z')

export function parseApiDate(value) {
  if (!value) return null
  const match = String(value).trim().match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])\.?\s?m\.?)?$/i,
  )
  if (!match) {
    const fallback = new Date(value)
    return Number.isNaN(fallback.getTime()) ? null : fallback
  }
  const [, day, month, year, hour, minute, second, meridiem] = match
  let hours = Number(hour || 0)
  if (meridiem) {
    const isPm = meridiem.toLowerCase() === 'p'
    if (hours === 12) hours = isPm ? 12 : 0
    else if (isPm) hours += 12
  }
  return new Date(Date.UTC(
    Number(year), Number(month) - 1, Number(day),
    hours, Number(minute || 0), Number(second || 0),
  ))
}

function toNumber(value) {
  const parsed = Number(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function groupRows(rows, country) {
  const groups = new Map()

  for (const row of rows) {
    const documento = String(row.documento ?? '').trim()
    if (!documento) continue

    const externalId = `${country}-${documento}`
    if (!groups.has(externalId)) {
      groups.set(externalId, {
        externalId,
        documento,
        country,
        fecha: parseApiDate(row.fecha),
        clienteCodigo: String(row.cliente ?? '').trim(),
        clienteNombre: String(row.nombre ?? '').trim(),
        bodegaOrigen: String(row.bodegaorigen ?? '').trim(),
        bodegaDestino: String(row.bodegadestino ?? '').trim(),
        tipoSolicitud: String(row.tiposolicitud ?? '').trim(),
        items: [],
        totalLineas: 0,
        totalCantidad: 0,
      })
    }

    const group = groups.get(externalId)
    const cantidad = toNumber(row.cantidad)
    group.items.push({
      modelo: String(row.modelo ?? '').trim(),
      descripcion: String(row.descripcion ?? '').trim(),
      cantidad,
    })
    group.totalCantidad += cantidad
    group.totalLineas = group.items.length
  }

  return [...groups.values()]
}

async function fetchCountry(country, { force = false } = {}) {
  const apiKey = process.env.EXTERNAL_API_KEY
  if (!apiKey) throw new Error('EXTERNAL_API_KEY no está configurada')

  const cached = countryCache.get(country)
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.rows
  if (force) countryCache.delete(country)

  const response = await fetch(`${API_BASE()}?var_pais=${encodeURIComponent(country)}`, {
    headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  })
  const text = await response.text()

  if (response.status === 404 && text.trim() === '') {
    countryCache.set(country, { at: Date.now(), rows: [] })
    return []
  }
  if (!response.ok) throw new Error(`API externa ${country}: HTTP ${response.status}`)

  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error(`La API externa ${country} respondió con JSON inválido.`)
  }

  const rows = Array.isArray(payload)
    ? payload
    : payload.data ?? payload.value ?? payload.result ?? []
  if (!Array.isArray(rows)) {
    throw new Error(`La API externa ${country} no devolvió una lista de solicitudes.`)
  }
  countryCache.set(country, { at: Date.now(), rows })
  return rows
}

export function clearExternalRequestCache() {
  countryCache.clear()
}

export async function syncExternalApi({
  countries = COUNTRIES,
  fetcher = fetchCountry,
  force = false,
} = {}) {
  const summary = {
    startedAt: new Date(),
    minDate: MIN_DATE,
    rows: 0,
    documents: 0,
    skippedByDate: 0,
    errors: [],
  }
  const requests = []

  for (const country of countries) {
    try {
      const source = await fetcher(country, { force })
      const rows = Array.isArray(source) ? source : source.rows
      if (!Array.isArray(rows)) throw new Error(`La API externa ${country} no devolvió una lista de solicitudes.`)
      summary.rows += rows.length
      const allGroups = groupRows(rows, country)
      const filtered = allGroups.filter((group) => group.fecha && group.fecha >= MIN_DATE)
      summary.skippedByDate += allGroups.length - filtered.length
      summary.documents += filtered.length
      requests.push(...filtered)
    } catch (error) {
      summary.errors.push({ country, message: error.message })
    }
  }

  summary.finishedAt = new Date()
  summary.durationMs = summary.finishedAt - summary.startedAt
  return { ...summary, requests }
}

export async function getExternalRequests(countries = COUNTRIES, options) {
  const result = await syncExternalApi({ countries, ...options })
  if (result.errors.length) {
    throw new Error(result.errors.map(({ country, message }) => `${country}: ${message}`).join('; '))
  }
  return result.requests
}

export async function getExternalRequest(externalId, options) {
  const country = String(externalId).split('-', 1)[0]
  if (!COUNTRIES.includes(country)) return null
  const requests = await getExternalRequests([country], options)
  return requests.find((item) => item.externalId === externalId) ?? null
}
