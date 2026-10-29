import bcrypt from 'bcryptjs'
import { User, ROLES } from '../models/User.js'

export function getConfiguredUsers(env = process.env) {
  return [
    {
      email: env.AUTH_GLOBAL_EMAIL || 'gerentegeneral@red.com',
      password: env.AUTH_GLOBAL_PASSWORD,
      name: 'Gerente general',
      role: ROLES.GERENTE_GENERAL,
      country: null,
    },
    {
      email: 'gerenteguatemala@red.com',
      password: env.AUTH_GUATEMALA_PASSWORD,
      name: 'Gerente Guatemala',
      role: ROLES.GERENTE_REGIONAL,
      country: 'GT',
    },
    {
      email: 'gerenteelsalvador@red.com',
      password: env.AUTH_ELSALVADOR_PASSWORD,
      name: 'Gerente El Salvador',
      role: ROLES.GERENTE_REGIONAL,
      country: 'SV',
    },
  ]
}

export async function provisionConfiguredUsers({ env = process.env, logger = console } = {}) {
  for (const account of getConfiguredUsers(env)) {
    const email = account.email.trim().toLowerCase()
    if (!account.password) {
      logger.warn(`[users] omitido ${email}: falta la variable de contraseña correspondiente`)
      continue
    }

    await User.findOneAndUpdate(
      { email },
      {
        $set: {
          name: account.name,
          role: account.role,
          country: account.country,
          active: true,
          passwordHash: await bcrypt.hash(account.password, 12),
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    )
    logger.info(`[users] cuenta lista: ${email}`)
  }
}
