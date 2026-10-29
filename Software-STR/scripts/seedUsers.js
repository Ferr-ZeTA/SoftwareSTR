/**
 * Crea/actualiza los usuarios del sistema con password hasheado (bcrypt).
 * Lee las contrasenas del .env; nunca quedan en el codigo.
 *
 *   node scripts/seedUsers.js
 */
import 'dotenv/config'
import mongoose from 'mongoose'
import { connectDB } from '../server/db.js'
import { provisionConfiguredUsers } from '../server/services/provisionUsers.js'

async function main() {
  await connectDB()
  await provisionConfiguredUsers()
  await mongoose.disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
