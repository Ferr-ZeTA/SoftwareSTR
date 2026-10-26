/**
 * Crea/actualiza los usuarios del sistema con password hasheado (bcrypt).
 * Lee las contrasenas del .env; nunca quedan en el codigo.
 *
 *   node scripts/seedUsers.js
 */
import 'dotenv/config'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { connectDB } from '../server/db.js'
import { User, ROLES } from '../server/models/User.js'

const seeds = [
  {
    email: process.env.AUTH_GLOBAL_EMAIL || 'gerentegeneral@red.com',
    password: process.env.AUTH_GLOBAL_PASSWORD,
    name: 'Gerente general',
    role: ROLES.GERENTE_GENERAL,
    country: null,
  },
  {
    email: 'gerenteguatemala@red.com',
    password: process.env.AUTH_GUATEMALA_PASSWORD,
    name: 'Gerente Guatemala',
    role: ROLES.GERENTE_REGIONAL,
    country: 'GT',
  },
  {
    email: 'gerenteelsalvador@red.com',
    password: process.env.AUTH_ELSALVADOR_PASSWORD,
    name: 'Gerente El Salvador',
    role: ROLES.GERENTE_REGIONAL,
    country: 'SV',
  },
]

async function main() {
  await connectDB()

  for (const seed of seeds) {
    if (!seed.password) {
      console.warn(`omitido ${seed.email}: falta su contrasena en .env`)
      continue
    }
    await User.findOneAndUpdate(
      { email: seed.email.toLowerCase() },
      {
        $set: {
          name: seed.name,
          role: seed.role,
          country: seed.country,
          active: true,
          passwordHash: await bcrypt.hash(seed.password, 12),
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    )
    console.log(`listo ${seed.email} (${seed.role}${seed.country ? ' ' + seed.country : ''})`)
  }

  await mongoose.disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
