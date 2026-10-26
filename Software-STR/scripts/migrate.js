/**
 * Poblado inicial de MongoDB desde la API externa.
 *
 * La API es la unica fuente de datos: este script no lee ningun archivo local.
 * Es idempotente, asi que puede correrse cuantas veces se quiera; los campos
 * de control local (localStatus, internalNotes, deletedLocally, tokens) nunca
 * se tocan en las corridas posteriores.
 *
 *   node scripts/migrate.js
 *   node scripts/migrate.js --countries GT
 *   node scripts/migrate.js --drop     # vacia la coleccion antes (destructivo)
 */
import 'dotenv/config'
import mongoose from 'mongoose'
import { connectDB } from '../server/db.js'
import { Request, LOCAL_STATUS } from '../server/models/Request.js'
import { syncExternalApi } from '../server/services/syncExternalApi.js'

function parseCountries() {
  const index = process.argv.indexOf('--countries')
  if (index === -1) return undefined
  return process.argv[index + 1]?.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean)
}

async function main() {
  const countries = parseCountries()
  const drop = process.argv.includes('--drop')

  await connectDB()
  console.log(`MongoDB conectado (${mongoose.connection.name})`)

  if (drop) {
    const deleted = await Request.deleteMany({})
    console.log(`--drop: ${deleted.deletedCount} documentos eliminados`)
  }

  const before = await Request.countDocuments()
  const summary = await syncExternalApi(countries ? { countries } : undefined)

  // Elimina lo que quedo de corridas anteriores y ya no entra en el rango.
  const purged = await Request.deleteMany({
    $or: [{ fecha: { $lt: summary.minDate } }, { fecha: null }],
  })
  if (purged.deletedCount) {
    console.log(`Purgados ${purged.deletedCount} documentos anteriores a `
      + summary.minDate.toISOString().slice(0, 10))
  }

  console.log('\n--- Sincronizacion ---')
  console.log(`Filas recibidas:     ${summary.rows}`)
  console.log(`Documentos en rango:  ${summary.documents}  (desde ${summary.minDate.toISOString().slice(0, 10)})`)
  console.log(`Descartados por fecha:${summary.skippedByDate}`)
  console.log(`Insertados nuevos:   ${summary.upserted}`)
  console.log(`Ya existentes:       ${summary.matched}`)
  console.log(`Duracion:            ${summary.durationMs}ms`)

  if (summary.errors.length) {
    console.warn('\nErrores por pais:')
    for (const error of summary.errors) console.warn(`  ${error.country}: ${error.message}`)
  }

  const [total, porPais, pendientes] = await Promise.all([
    Request.countDocuments(),
    Request.aggregate([{ $group: { _id: '$country', n: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Request.countDocuments({ localStatus: LOCAL_STATUS.PENDIENTE, deletedLocally: false }),
  ])

  console.log('\n--- Estado de la coleccion ---')
  console.log(`Antes: ${before}  ->  Ahora: ${total}`)
  for (const row of porPais) console.log(`  ${row._id}: ${row.n}`)
  console.log(`Pendientes de aprobacion: ${pendientes}`)

  await mongoose.disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
