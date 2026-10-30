/**
 * Compara el conjunto actual de solicitudes de la API con las referencias
 * locales de MongoDB. Los detalles operativos solo se leen de la API.
 *
 *   node scripts/audit.js
 */
import 'dotenv/config'
import mongoose from 'mongoose'
import { connectDB } from '../server/db.js'
import { Request, LOCAL_STATUS } from '../server/models/Request.js'
import { syncExternalApi } from '../server/services/syncExternalApi.js'

async function main() {
  await connectDB()
  const summary = await syncExternalApi({ force: true })
  if (summary.errors.length) {
    throw new Error(summary.errors.map((item) => `${item.country}: ${item.message}`).join('; '))
  }

  const states = await Request.find({})
    .select('externalId localStatus deletedLocally')
    .lean()
  const apiIds = new Set(summary.requests.map((request) => request.externalId))
  const retainedWithoutApi = states.filter((state) => !apiIds.has(state.externalId))

  console.log('--- Auditoría de datos ---')
  console.log(`API: ${summary.rows} filas; ${summary.documents} solicitudes dentro de fecha.`)
  console.log(`MongoDB: ${states.length} referencias con estado local; no contiene payload operativo.`)
  console.log(`Estados locales sin solicitud actual en API: ${retainedWithoutApi.length} (conservados).`)
  for (const status of Object.values(LOCAL_STATUS)) {
    console.log(`${status}: ${states.filter((state) => state.localStatus === status).length}`)
  }
  console.log(`Ocultas localmente: ${states.filter((state) => state.deletedLocally).length}`)

  await mongoose.disconnect()
}

main().catch(async (error) => {
  console.error(error.message)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
