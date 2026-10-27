import express from 'express'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { authRouter } from './routes/auth.js'
import { requestsRouter } from './routes/requests.js'
import { usersRouter } from './routes/users.js'

export function createApp() {
  const app = express()

  app.use(express.json({ limit: '1mb' }))

  app.use((request, response, next) => {
    response.set({
      'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    })
    if (request.method === 'OPTIONS') return response.sendStatus(204)
    return next()
  })

  app.get('/api/health', (request, response) => response.json({ ok: true }))
  app.use('/api/auth', authRouter)
  app.use('/api/requests', requestsRouter)
  app.use('/api/users', usersRouter)

  // En produccion el mismo servicio sirve el frontend compilado, asi que la
  // app y la API comparten origen y los enlaces del correo son absolutos.
  const dist = fileURLToPath(new URL('../dist', import.meta.url))
  if (existsSync(dist)) {
    app.use(express.static(dist, { maxAge: '1h', index: false }))
    app.get(/^(?!\/api\/).*/, (request, response) => {
      response.sendFile('index.html', { root: dist })
    })
  }

  app.use((request, response) => response.status(404).json({ error: 'Ruta no encontrada.' }))

  // eslint-disable-next-line no-unused-vars
  app.use((error, request, response, next) => {
    console.error(error)
    response.status(500).json({ error: error.message || 'Error interno.' })
  })

  return app
}
