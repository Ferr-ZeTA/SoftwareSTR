import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { User } from '../models/User.js'
import { signToken, authenticate } from '../middleware/auth.js'

export const authRouter = Router()

authRouter.post('/login', async (request, response) => {
  const email = String(request.body?.email || '').trim().toLowerCase()
  const password = String(request.body?.password || '')
  if (!email || !password) {
    return response.status(400).json({ error: 'Correo y contraseña son obligatorios.' })
  }

  const user = await User.findOne({ email, active: true }).select('+passwordHash')
  // Mismo mensaje en ambos casos: no revela si el correo existe.
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return response.status(401).json({ error: 'Correo o contraseña incorrectos.' })
  }

  user.lastLoginAt = new Date()
  await user.save()

  return response.json({
    token: signToken(user),
    user: {
      email: user.email,
      name: user.name,
      role: user.role,
      country: user.country ?? null,
    },
  })
})

authRouter.get('/me', authenticate, (request, response) => {
  const { email, name, role, country } = request.user
  response.json({ email, name, role, country })
})
