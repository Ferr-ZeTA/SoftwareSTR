// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { User } from '../models/User.js'
import { provisionConfiguredUsers } from './provisionUsers.js'

let mongo

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri(), { dbName: 'strflow_user_provision_test' })
})

afterAll(async () => {
  await mongoose.disconnect()
  if (mongo) await mongo.stop()
})

describe('provisionConfiguredUsers', () => {
  it('creates all configured accounts in MongoDB with bcrypt password hashes', async () => {
    const logger = { info: vi.fn(), warn: vi.fn() }
    await provisionConfiguredUsers({
      env: {
        AUTH_GLOBAL_PASSWORD: 'global-test-password',
        AUTH_GUATEMALA_PASSWORD: 'guatemala-test-password',
        AUTH_ELSALVADOR_PASSWORD: 'elsalvador-test-password',
      },
      logger,
    })

    const accounts = await User.find({
      email: {
        $in: [
          'gerentegeneral@red.com',
          'gerenteguatemala@red.com',
          'gerenteelsalvador@red.com',
        ],
      },
    }).select('+passwordHash').lean()
    const byEmail = new Map(accounts.map((account) => [account.email, account]))

    expect(byEmail.get('gerentegeneral@red.com')).toMatchObject({
      role: 'GERENTE_GENERAL',
      country: null,
      active: true,
    })
    expect(byEmail.get('gerenteguatemala@red.com')).toMatchObject({
      role: 'GERENTE_REGIONAL',
      country: 'GT',
      active: true,
    })
    expect(byEmail.get('gerenteelsalvador@red.com')).toMatchObject({
      role: 'GERENTE_REGIONAL',
      country: 'SV',
      active: true,
    })
    expect(await bcrypt.compare('global-test-password', byEmail.get('gerentegeneral@red.com').passwordHash)).toBe(true)
    expect(await bcrypt.compare('guatemala-test-password', byEmail.get('gerenteguatemala@red.com').passwordHash)).toBe(true)
    expect(await bcrypt.compare('elsalvador-test-password', byEmail.get('gerenteelsalvador@red.com').passwordHash)).toBe(true)
    expect(logger.info).toHaveBeenCalledTimes(3)
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('synchronizes an existing account password from the current environment', async () => {
    await provisionConfiguredUsers({
      env: { AUTH_GUATEMALA_PASSWORD: 'new-test-password' },
      logger: { info: vi.fn(), warn: vi.fn() },
    })

    const user = await User.findOne({ email: 'gerenteguatemala@red.com' })
      .select('+passwordHash')
      .lean()

    expect(await bcrypt.compare('new-test-password', user.passwordHash)).toBe(true)
  })
})
