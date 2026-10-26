import { Request, EXTERNAL_FIELD_NAMES, LOCAL_DEFAULTS } from '../models/Request.js'

const API_BASE = process.env.EXTERNAL_API_URL
  || 'https://sapapi.red.com.sv/api/Procesos/solicitudtraslado'
const COUNTRIES = ['GT', 'SV']
// Solo se persisten traslados con fecha >= SYNC_MIN_DATE. La API devuelve
// historico desde 2023 y no nos interesa.
const MIN_DATE = new Date(process.env.SYNC_MIN_DATE || '2026-10-01T00:00:00Z')

// La API devuelve "30/06/2023 12:00:00 a.m." (dd/mm/yyyy + hora en español).
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

// Agrupa las filas (una por modelo) en un documento de traslado por `documento`.
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
        raw: [],
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
    group.raw.push(row)
  }

  return [...groups.values()]
}

async function fetchCountry(country) {
  const apiKey = process.env.EXTERNAL_API_KEY
  if (!apiKey) throw new Error('EXTERNAL_API_KEY no está configurada')

  const response = await fetch(`${API_BASE}?var_pais=${encodeURIComponent(country)}`, {
    headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`API externa ${country}: ${response.status} ${await response.text()}`)
  }

  const payload = await response.json()
  if (Array.isArray(payload)) return payload
  return payload.data ?? payload.value ?? payload.result ?? []
}

// Construye el $set únicamente con campos externos -> lo local queda intacto.
function buildUpdate(group, now) {
  const set = { lastSyncedAt: now }
  for (const field of EXTERNAL_FIELD_NAMES) {
    if (group[field] !== undefined) set[field] = group[field]
  }
  return {
    $set: set,
    $setOnInsert: LOCAL_DEFAULTS,
  }
}

export async function syncExternalApi({ countries = COUNTRIES, fetcher = fetchCountry } = {}) {
  const summary = {
    startedAt: new Date(),
    minDate: MIN_DATE,
    rows: 0,
    documents: 0,
    skippedByDate: 0,
    missing: 0,
    reappeared: 0,
    upserted: 0,
    modified: 0,
    matched: 0,
    errors: [],
  }
  const now = new Date()

  for (const country of countries) {
    let rows
    try {
      rows = await fetcher(country)
    } catch (error) {
      summary.errors.push({ country, message: error.message })
      continue
    }

    summary.rows += rows.length
    const allGroups = groupRows(rows, country)
    const groups = allGroups.filter((group) => group.fecha && group.fecha >= MIN_DATE)
    summary.skippedByDate += allGroups.length - groups.length
    summary.documents += groups.length
    if (!groups.length) continue

    const operations = groups.map((group) => ({
      updateOne: {
        filter: { externalId: group.externalId },
        update: buildUpdate(group, now),
        upsert: true,
      },
    }))

    const result = await Request.bulkWrite(operations, { ordered: false })
    summary.upserted += result.upsertedCount ?? 0
    summary.modified += result.modifiedCount ?? 0
    summary.matched += result.matchedCount ?? 0

    // Solo se llega aqui si el fetch de este pais funciono, asi que la
    // ausencia es real y no un fallo de red.
    const seen = groups.map((group) => group.externalId)
    const gone = await Request.updateMany(
      // $ne: true y no "false", porque los documentos creados antes de que
      // existiera el campo simplemente no lo tienen.
      { country, externalId: { $nin: seen }, missingFromApi: { $ne: true } },
      { $set: { missingFromApi: true, missingSince: now } },
    )
    summary.missing += gone.modifiedCount ?? 0

    const back = await Request.updateMany(
      { country, externalId: { $in: seen }, missingFromApi: true },
      { $set: { missingFromApi: false, missingSince: null } },
    )
    summary.reappeared += back.modifiedCount ?? 0
  }

  summary.finishedAt = new Date()
  summary.durationMs = summary.finishedAt - summary.startedAt
  return summary
}

// Refresco puntual de un documento con findOneAndUpdate.
export async function upsertRequest(rows, country) {
  const [group] = groupRows(rows, country)
  if (!group) return null
  return Request.findOneAndUpdate(
    { externalId: group.externalId },
    buildUpdate(group, new Date()),
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  )
}
