/**
 * Valida la lectura actual de la API y que MongoDB conserve solo estado local.
 *
 *   node scripts/validate.js
 */
import 'dotenv/config'
import mongoose from 'mongoose'
import { connectDB } from '../server/db.js'
import { Request } from '../server/models/Request.js'
import { syncExternalApi } from '../server/services/syncExternalApi.js'

async function main() {
  await connectDB()
  const result = await syncExternalApi({ force: true })
  if (result.errors.length) {
    throw new Error(result.errors.map((item) => `${item.country}: ${item.message}`).join('; '))
  }

  const states = await Request.find({})
    .select('externalId country localStatus deletedLocally')
    .lean()
  const payloadFields = [
    'documento', 'fecha', 'clienteCodigo', 'clienteNombre', 'bodegaOrigen',
    'bodegaDestino', 'tipoSolicitud', 'items', 'totalLineas', 'totalCantidad', 'raw',
  ]
  const legacyQuery = {
    $or: payloadFields.map((field) => ({ [field]: { $exists: true } })),
  }
  const legacySnapshots = await Request.collection.countDocuments(legacyQuery)
  const apiIds = new Set(result.requests.map((item) => item.externalId))
  const retainedStates = states.filter((item) => !apiIds.has(item.externalId))

  console.log(`API: ${result.rows} filas y ${result.documents} solicitudes dentro de fecha.`)
  console.log(`MongoDB: ${states.length} estados locales.`)
  console.log(`Referencias locales no presentes en la API actual: ${retainedStates.length} (conservadas).`)
  console.log(`Snapshots operativos antiguos en MongoDB: ${legacySnapshots}.`)
  if (legacySnapshots) throw new Error('MongoDB aún contiene datos operativos antiguos; reinicia el servidor para aplicar su limpieza.')

  await mongoose.disconnect()
}

main().catch(async (error) => {
  console.error(error.message)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
