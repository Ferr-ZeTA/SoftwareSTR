import 'dotenv/config'
import { createApp } from './app.js'
import { connectDB } from './db.js'
import { provisionConfiguredUsers } from './services/provisionUsers.js'
import { getBrevoConfigStatus } from './services/mailer.js'
import { Request } from './models/Request.js'

const port = Number(process.env.PORT || 8787)

const brevoConfig = Object.entries(getBrevoConfigStatus())
  .map(([name, configured]) => `${name}=${configured ? 'presente' : 'FALTA'}`)
  .join(', ')
console.info(`[mailer] Variables requeridas: ${brevoConfig}`)

await connectDB()
console.log('MongoDB conectado')
const cleanup = await Request.collection.updateMany({}, {
  $unset: {
    documento: '',
    fecha: '',
    clienteCodigo: '',
    clienteNombre: '',
    bodegaOrigen: '',
    bodegaDestino: '',
    tipoSolicitud: '',
    items: '',
    totalLineas: '',
    totalCantidad: '',
    raw: '',
    missingFromApi: '',
    missingSince: '',
    lastSyncedAt: '',
  },
})
if (cleanup.modifiedCount) {
  console.log(`[migration] Se eliminaron campos operativos antiguos de ${cleanup.modifiedCount} estados locales.`)
}
await provisionConfiguredUsers()

createApp().listen(port, () => console.log(`STRflow API en http://localhost:${port}`))
