import jwt from 'jsonwebtoken'
import { ROLES } from '../models/User.js'

const JWT_SECRET = process.env.JWT_SECRET
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h'

export function signToken(user) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET no está configurada')
  return jwt.sign(
    {
      sub: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
      country: user.country ?? null,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  )
}

export function authenticate(request, response, next) {
  const header = request.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null
  if (!token) return response.status(401).json({ error: 'Token ausente.' })

  try {
    request.user = jwt.verify(token, JWT_SECRET)
    return next()
  } catch {
    return response.status(401).json({ error: 'Token inválido o expirado.' })
  }
}

export function requireRole(...roles) {
  return (request, response, next) => {
    if (!request.user) return response.status(401).json({ error: 'No autenticado.' })
    if (!roles.includes(request.user.role)) {
      return response.status(403).json({ error: 'No autorizado para esta operación.' })
    }
    return next()
  }
}

// Filtro de alcance resuelto en el servidor. El cliente no puede ampliarlo:
// un GERENTE_REGIONAL siempre queda encerrado en su país.
export function scopeFilter(user) {
  if (user.role === ROLES.GERENTE_GENERAL) return {}
  if (!user.country) throw new Error('El gerente regional no tiene país asignado.')
  return { country: user.country }
}

export function enforceScope(request, response, next) {
  try {
    request.scope = scopeFilter(request.user)
    return next()
  } catch (error) {
    return response.status(403).json({ error: error.message })
  }
}
