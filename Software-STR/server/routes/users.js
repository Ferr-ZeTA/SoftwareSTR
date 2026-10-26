import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { User, ROLES } from '../models/User.js'
import { authenticate, requireRole } from '../middleware/auth.js'

export const usersRouter = Router()

// La gestion de usuarios es exclusiva del gerente general.
usersRouter.use(authenticate, requireRole(ROLES.GERENTE_GENERAL))

usersRouter.get('/', async (request, response) => {
  const users = await User.find().select('-passwordHash').sort({ createdAt: -1 }).lean()
  response.json({ data: users, total: users.length })
})

usersRouter.post('/', async (request, response) => {
  const email = String(request.body?.email || '').trim().toLowerCase()
  const name = String(request.body?.name || '').trim()
  const password = String(request.body?.password || '')
  const role = String(request.body?.role || '')
  const country = request.body?.country ? String(request.body.country).toUpperCase() : null

  if (!email || !name || !password) {
    return response.status(400).json({ error: 'Nombre, correo y contraseña son obligatorios.' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(400).json({ error: 'El correo no tiene un formato válido.' })
  }
  if (password.length < 8) {
    return response.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' })
  }
  if (!Object.values(ROLES).includes(role)) {
    return response.status(400).json({ error: 'Rol inválido.' })
  }
  if (role === ROLES.GERENTE_REGIONAL && !['GT', 'SV'].includes(country)) {
    return response.status(400).json({ error: 'Un gerente regional necesita país (GT o SV).' })
  }
  if (await User.exists({ email })) {
    return response.status(409).json({ error: 'Ya existe un usuario con ese correo.' })
  }

  const created = await User.create({
    email,
    name,
    role,
    country: role === ROLES.GERENTE_REGIONAL ? country : null,
    passwordHash: await bcrypt.hash(password, 12),
  })

  const { passwordHash, ...safe } = created.toObject()
  response.status(201).json(safe)
})

usersRouter.patch('/:id', async (request, response) => {
  const update = {}
  if (request.body?.name !== undefined) update.name = String(request.body.name).trim()
  if (request.body?.active !== undefined) update.active = Boolean(request.body.active)
  if (request.body?.password) {
    if (String(request.body.password).length < 8) {
      return response.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' })
    }
    update.passwordHash = await bcrypt.hash(String(request.body.password), 12)
  }
  if (!Object.keys(update).length) {
    return response.status(400).json({ error: 'Nada que actualizar.' })
  }

  // Nadie puede desactivarse a si mismo y quedar fuera del sistema.
  if (update.active === false && request.params.id === request.user.sub) {
    return response.status(400).json({ error: 'No puedes desactivar tu propia cuenta.' })
  }

  const updated = await User.findByIdAndUpdate(request.params.id, { $set: update }, {
    returnDocument: 'after',
  }).select('-passwordHash')
  if (!updated) return response.status(404).json({ error: 'Usuario no encontrado.' })
  response.json(updated)
})

usersRouter.delete('/:id', async (request, response) => {
  if (request.params.id === request.user.sub) {
    return response.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' })
  }
  const deleted = await User.findByIdAndDelete(request.params.id).select('-passwordHash')
  if (!deleted) return response.status(404).json({ error: 'Usuario no encontrado.' })
  response.json({ deleted: true, email: deleted.email })
})
