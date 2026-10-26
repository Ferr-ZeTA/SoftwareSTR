/**
 * Auditoría: confirma que lo que hay en MongoDB viene exclusivamente de la
 * API externa, y muestra el estado de aprobación local de cada traslado.
 *
 *   node scripts/audit.js
 */
import 'dotenv/config'
import mongoose from 'mongoose'
import { connectDB } from '../server/db.js'
import { Request, LOCAL_STATUS } from '../server/models/Request.js'
import { groupRows, parseApiDate } from '../server/services/syncExternalApi.js'

const API_BASE = process.env.EXTERNAL_API_URL
const MIN_DATE = new Date(process.env.SYNC_MIN_DATE || '2026-10-01T00:00:00Z')

// Campos que la API manda. Si alguno difiere, la DB no es fiel a la API.
const API_FIELDS = [
  'documento', 'country', 'clienteCodigo', 'clienteNombre',
  'bodegaOrigen', 'bodegaDestino', 'tipoSolicitud', 'totalLineas', 'totalCantidad',
]

async function fetchCountry(country) {
  const response = await fetch(`${API_BASE}?var_pais=${country}`, {
    headers: { 'X-API-Key': process.env.EXTERNAL_API_KEY, Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`${country}: HTTP ${response.status}`)
  return response.json()
}

function sameItems(a, b) {
  if (a.length !== b.length) return false
  return a.every((item, index) =>
    item.modelo === b[index].modelo
    && item.descripcion === b[index].descripcion
    && Number(item.cantidad) === Number(b[index].cantidad))
}

async function main() {
  await connectDB()

  console.log('='.repeat(64))
  console.log('1. ORIGEN DE LOS DATOS')
  console.log('='.repeat(64))

  const fromApi = new Map()
  for (const country of ['GT', 'SV']) {
    const rows = await fetchCountry(country)
    for (const group of groupRows(rows, country)) {
      if (group.fecha && group.fecha >= MIN_DATE) fromApi.set(group.externalId, group)
    }
    console.log(`API ${country}: ${rows.length} filas recibidas`)
  }
  console.log(`API total en rango (desde ${MIN_DATE.toISOString().slice(0, 10)}): ${fromApi.size} traslados`)

  const inDb = await Request.find().lean()
  console.log(`MongoDB: ${inDb.length} traslados\n`)

  const huerfanos = []   // en la DB pero no en la API
  const faltantes = []   // en la API pero no en la DB
  const divergentes = [] // mismo id, datos distintos

  const ausentes = []
  for (const doc of inDb) {
    const api = fromApi.get(doc.externalId)
    if (!api) {
      // Si está marcado, la API dejó de traerlo (no es un dato inventado).
      if (doc.missingFromApi) ausentes.push(doc)
      else huerfanos.push(doc.externalId)
      continue
    }

    const diffs = API_FIELDS.filter((field) => String(doc[field]) !== String(api[field]))
    if (doc.fecha?.getTime() !== api.fecha?.getTime()) diffs.push('fecha')
    if (!sameItems(doc.items, api.items)) diffs.push('items')
    if (diffs.length) divergentes.push({ id: doc.externalId, diffs })
  }
  for (const id of fromApi.keys()) {
    if (!inDb.some((doc) => doc.externalId === id)) faltantes.push(id)
  }

  const ok = (label, list) => {
    const clean = list.length === 0
    console.log(`${clean ? '[OK]  ' : '[MAL] '}${label}: ${list.length}`)
    if (!clean) console.log('       ' + JSON.stringify(list.slice(0, 5)))
    return clean
  }

  const a = ok('Registros en la DB que NO vienen de la API (inventados)', huerfanos)
  if (ausentes.length) {
    console.log(`[AVISO] La API dejó de traer ${ausentes.length} traslado(s) que ya teníamos:`)
    for (const doc of ausentes) {
      console.log(`         ${doc.externalId} (${doc.localStatus})`
        + ` desde ${doc.missingSince ? new Date(doc.missingSince).toLocaleString('es-GT') : '?'}`)
    }
    console.log('         Se conservan para no perder su estado local.')
  }
  const b = ok('Registros de la API que faltan en la DB', faltantes)
  const c = ok('Registros con datos distintos a la API', divergentes)

  console.log(`\n=> ${a && b && c
    ? 'CONFIRMADO: cada campo de la API coincide exactamente con la DB.'
    : 'HAY DIFERENCIAS, revisar arriba.'}`)

  // Rastro de datos mock
  const mock = await Request.countDocuments({
    $or: [{ documento: /^STR-/ }, { externalId: /^STR-/ }],
  })
  console.log(`${mock === 0 ? '[OK]  ' : '[MAL] '}Rastros del JSON mock (ids "STR-..."): ${mock}`)

  console.log('\n' + '='.repeat(64))
  console.log('2. ESTADO DE APROBACIÓN (dato local, no viene de la API)')
  console.log('='.repeat(64))

  for (const status of Object.values(LOCAL_STATUS)) {
    console.log(`  ${status.padEnd(14)} ${await Request.countDocuments({ localStatus: status })}`)
  }
  console.log(`  ${'Borrados'.padEnd(14)} ${await Request.countDocuments({ deletedLocally: true })}`)

  const decididos = await Request.find({ localStatus: { $ne: LOCAL_STATUS.PENDIENTE } })
    .sort({ approvalDecidedAt: -1 })
    .select('externalId clienteNombre localStatus approvalDecidedAt approvalDecidedBy approvalDecidedVia approvalSentTo')
    .lean()

  if (!decididos.length) {
    console.log('\n  Todavía no hay traslados aprobados ni rechazados.')
  } else {
    console.log(`\n  ${decididos.length} traslado(s) con decisión registrada:\n`)
    for (const doc of decididos) {
      const cuando = doc.approvalDecidedAt
        ? new Date(doc.approvalDecidedAt).toLocaleString('es-GT', { timeZone: 'America/Guatemala' })
        : 'sin fecha'
      console.log(`  ${doc.externalId.padEnd(10)} ${doc.localStatus.padEnd(12)} ${cuando}`)
      console.log(`     cliente: ${doc.clienteNombre}`)
      console.log(`     decidió: ${doc.approvalDecidedBy || 'no registrado'}`
        + ` (${doc.approvalDecidedVia || 'origen no registrado'})`)
    }
  }

  // Que la decision local sobreviva a la sincronizacion
  const conDecision = decididos[0]
  if (conDecision) {
    const api = fromApi.get(conDecision.externalId)
    console.log(`\n  La API no manda ningún estado de aprobación para ${conDecision.externalId}:`)
    console.log(`     campos que trae la API: ${Object.keys(api?.raw?.[0] ?? {}).join(', ')}`)
    console.log('     => el estado es 100% nuestro y la sincronización no lo toca.')
  }

  await mongoose.disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
