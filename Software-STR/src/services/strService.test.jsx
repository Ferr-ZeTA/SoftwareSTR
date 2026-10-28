import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUser, deleteUser, getUsers, toggleUser } from './strService'

const DEMO_USERS_KEY = 'strflow-demo-users'

describe('gestión demo de usuarios', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    localStorage.removeItem(DEMO_USERS_KEY)
  })

  afterEach(() => {
    localStorage.removeItem(DEMO_USERS_KEY)
    vi.unstubAllEnvs()
  })

  it('crea, lista, activa y elimina usuarios sin guardar contraseñas', async () => {
    const [admin] = await getUsers()
    const created = await createUser({
      name: 'Ana Pérez',
      email: ' ANA@RED.COM ',
      password: 'password-seguro',
      role: 'GERENTE_REGIONAL',
      country: 'SV',
    })

    expect(created.email).toBe('ana@red.com')
    expect(created.country).toBe('SV')
    expect((await getUsers()).map((user) => user.email)).toEqual([
      'ana@red.com',
      'demo@strflow.local',
    ])
    expect(localStorage.getItem(DEMO_USERS_KEY)).not.toContain('password-seguro')

    await toggleUser(created._id, false)
    expect((await getUsers()).find((user) => user._id === created._id).active).toBe(false)

    await deleteUser(created._id)
    expect((await getUsers()).map((user) => user.email)).toEqual([admin.email])
  })

  it('rechaza correos duplicados en el modo demo', async () => {
    await expect(createUser({
      name: 'Duplicado',
      email: 'DEMO@STRFLOW.LOCAL',
      password: 'password-seguro',
      role: 'GERENTE_GENERAL',
    })).rejects.toThrow('Ya existe un usuario con ese correo.')
  })
})
