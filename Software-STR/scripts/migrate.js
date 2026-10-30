/**
 * Comprueba los datos actuales de la API y el estado local persistido.
 * No copia datos operativos a MongoDB ni elimina estados locales.
 *
 *   node scripts/migrate.js
 *   node scripts/migrate.js --countries GT
 */
import 'dotenv/config'
import mongoose from 'mongoose'
import { connectDB } from '../server/db.js'
import { Request } from '../server/models/Request.js'
import { syncExternalApi } from '../server/services/syncExternalApi.js'

function parseCountries() {
  const index = process.argv.indexOf('--countries')
  if (index === -1) return undefined
  const countries = process.argv[index + 1]
    ?.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean)
  if (!countries?.length || countries.some((country) => !['GT', 'SV'].includes(country))) {
    throw new Error('--countries acepta GT, SV o GT,SV.')
  }
  return countries
}

async function main() {
  if (process.argv.includes('--drop')) {
    throw new Error('--drop ya no está disponible: este comando no debe borrar estados locales.')
  }
  await connectDB()
  console.log(`MongoDB conectado (${mongoose.connection.name})`)

  const countries = parseCountries()
  const summary = await syncExternalApi({ countries, force: true })
  if (summary.errors.length) {
    throw new Error(summary.errors.map((item) => `${item.country}: ${item.message}`).join('; '))
  }
  const states = await Request.find(countries ? { country: { $in: countries } } : {})
    .select('externalId country localStatus deletedLocally')
    .lean()
  const apiIds = new Set(summary.requests.map((request) => request.externalId))
  const notCurrentlyInApi = states.filter((state) => !apiIds.has(state.externalId))

  console.log('\n--- Datos leídos de la API (sin persistir payload) ---')
  console.log(`Filas recibidas:       ${summary.rows}`)
  console.log(`Solicitudes vigentes:  ${summary.documents}`)
  console.log(`Fuera de fecha mínima: ${summary.skippedByDate}`)
  console.log(`Corte:                 ${summary.minDate.toISOString().slice(0, 10)}`)
  console.log('\n--- Estados locales en MongoDB ---')
  console.log(`Estados guardados:     ${states.length}`)
  console.log(`Sin solicitud en API:  ${notCurrentlyInApi.length} (se conservan; no se borran)`)

  await mongoose.disconnect()
}

main().catch(async (error) => {
  console.error(error.message)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
