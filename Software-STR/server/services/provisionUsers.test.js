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
  it('creates configured accounts in MongoDB with a bcrypt password hash', async () => {
    const logger = { info: vi.fn(), warn: vi.fn() }
    await provisionConfiguredUsers({
      env: { AUTH_GUATEMALA_PASSWORD: 'test-password' },
      logger,
    })

    const user = await User.findOne({ email: 'gerenteguatemala@red.com' })
      .select('+passwordHash')
      .lean()

    expect(user).toMatchObject({
      role: 'GERENTE_REGIONAL',
      country: 'GT',
      active: true,
    })
    expect(await bcrypt.compare('test-password', user.passwordHash)).toBe(true)
    expect(logger.info).toHaveBeenCalledWith('[users] cuenta lista: gerenteguatemala@red.com')
    expect(logger.warn).toHaveBeenCalledTimes(2)
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
