import 'dotenv/config'
import { createApp } from './app.js'
import { connectDB } from './db.js'
import { syncExternalApi } from './services/syncExternalApi.js'

const port = Number(process.env.PORT || 8787)
const syncMinutes = Number(process.env.SYNC_INTERVAL_MINUTES || 0)

await connectDB()
console.log('MongoDB conectado')

if (syncMinutes > 0) {
  const run = async () => {
    try {
      const summary = await syncExternalApi()
      console.log(
        `[sync] ${summary.documents} documentos (${summary.rows} filas) `
        + `upsert=${summary.upserted} mod=${summary.modified} en ${summary.durationMs}ms`,
      )
      if (summary.errors.length) console.warn('[sync] errores:', summary.errors)
    } catch (error) {
      console.error('[sync] fallo:', error.message)
    }
  }
  await run()
  setInterval(run, syncMinutes * 60_000).unref()
}

createApp().listen(port, () => console.log(`STRflow API en http://localhost:${port}`))
