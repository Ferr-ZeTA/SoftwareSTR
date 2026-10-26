/**
 * Validación completa del sistema, de punta a punta, contra los servicios
 * reales (MongoDB, la API externa y Brevo).
 *
 *   node scripts/validate.js            # sin enviar correo
 *   node scripts/validate.js --email    # incluye un envío real por Brevo
 */
import 'dotenv/config'
import mongoose from 'mongoose'
import { connectDB } from '../server/db.js'
import { Request, LOCAL_STATUS } from '../server/models/Request.js'
import { User } from '../server/models/User.js'
import { syncExternalApi, groupRows } from '../server/services/syncExternalApi.js'
import { issueApprovalToken } from '../server/services/approvalService.js'

const API = 'http://127.0.0.1:8787'
const WEB = 'http://localhost:5173'
const sendEmail = process.argv.includes('--email')

let passed = 0
let failed = 0
const failures = []

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1
    console.log(`  [OK]   ${label}${detail ? '  ' + detail : ''}`)
  } else {
    failed += 1
    failures.push(label)
    console.log(`  [FALLA] ${label}${detail ? '  ' + detail : ''}`)
  }
}

function section(title) {
  console.log(`\n${'='.repeat(66)}\n${title}\n${'='.repeat(66)}`)
}

const json = async (path, options) => {
  const response = await fetch(API + path, options)
  const body = await response.json().catch(() => ({}))
  return { status: response.status, body }
}
const auth = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })

async function main() {
  await connectDB()

  // ---------------------------------------------------------------- 1
  section('1. SERVICIOS EN LÍNEA')

  check('MongoDB conectado', mongoose.connection.readyState === 1,
    `base "${mongoose.connection.name}"`)

  const health = await json('/api/health')
  check('API responde', health.status === 200 && health.body.ok === true, `HTTP ${health.status}`)

  let webUp = false
  try { webUp = (await fetch(WEB, { signal: AbortSignal.timeout(4000) })).ok } catch { /* abajo */ }
  check('Frontend sirviendo', webUp, webUp ? WEB : 'no responde (¿npm run dev:web?)')

  // ---------------------------------------------------------------- 2
  section('2. API EXTERNA Y SINCRONIZACIÓN')

  const apiResponse = await fetch(`${process.env.EXTERNAL_API_URL}?var_pais=GT`, {
    headers: { 'X-API-Key': process.env.EXTERNAL_API_KEY },
  })
  check('API externa accesible', apiResponse.status === 200, `HTTP ${apiResponse.status}`)
  const apiRows = await apiResponse.json()
  check('API externa devuelve filas', apiRows.length > 0, `${apiRows.length} filas GT`)

  const minDate = new Date(process.env.SYNC_MIN_DATE || '2026-10-01T00:00:00Z')
  const apiDocs = groupRows(apiRows, 'GT').filter((g) => g.fecha && g.fecha >= minDate)
  // La API es un sistema vivo: puede traer traslados nuevos o dejar de
  // traer alguno entre una corrida y otra. Lo que debe cumplirse siempre es
  // que todo lo que la API trae esté en la DB.
  const dbIds = new Set((await Request.find({ country: 'GT' }).select('externalId').lean())
    .map((doc) => doc.externalId))
  const faltantes = apiDocs.filter((group) => !dbIds.has(group.externalId))
  check('Todo lo que trae la API está en la DB', faltantes.length === 0,
    `API ${apiDocs.length} / DB ${dbIds.size}`)

  const anteriores = await Request.countDocuments({ fecha: { $lt: minDate } })
  check('Sin registros anteriores al corte de fecha', anteriores === 0,
    `corte ${minDate.toISOString().slice(0, 10)}`)

  const sample = await Request.findOne({ country: 'GT' }).lean()
  const apiMatch = apiDocs.find((g) => g.externalId === sample.externalId)
  check('Los campos coinciden con la API',
    apiMatch && sample.clienteNombre === apiMatch.clienteNombre
      && sample.bodegaOrigen === apiMatch.bodegaOrigen
      && sample.totalCantidad === apiMatch.totalCantidad, sample.externalId)

  // Primera pasada: absorbe lo que haya cambiado en la API.
  const primera = await syncExternalApi()
  check('Sincronizar sin errores', primera.errors.length === 0, `${primera.documents} documentos`)
  if (primera.upserted) console.log(`         (la API trajo ${primera.upserted} traslado(s) nuevo(s))`)
  if (primera.missing) console.log(`         (${primera.missing} dejaron de venir y quedaron marcados)`)

  // Segunda pasada inmediata: ahora sí nada debe cambiar.
  const before = await Request.countDocuments()
  const segunda = await syncExternalApi()
  const after = await Request.countDocuments()
  check('Sincronizar dos veces no duplica', before === after && segunda.upserted === 0,
    `${before} -> ${after}, nuevos ${segunda.upserted}`)
  check('La segunda pasada no marca nada como ausente', segunda.missing === 0)

  // Ya sincronizado, los que la API dejó de traer deben estar marcados.
  const marcados = await Request.countDocuments({ country: 'GT', missingFromApi: true })
  const idsAhora = new Set((await Request.find({ country: 'GT' }).select('externalId').lean())
    .map((doc) => doc.externalId))
  const extra = idsAhora.size - apiDocs.length
  check('Los que la API dejó de traer están marcados', marcados >= extra,
    extra > 0 ? `${extra} ya no vienen, ${marcados} marcados` : 'ninguno')

  // ---------------------------------------------------------------- 3
  section('3. AUTENTICACIÓN Y ROLES')

  const login = (email, password) => json('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  const general = await login('gerentegeneral@red.com', 'General2026str')
  check('Login gerente general', general.status === 200 && !!general.body.token,
    general.body.user?.role)
  const gt = await login('gerenteguatemala@red.com', 'Guate2026str')
  check('Login gerente GT', gt.status === 200, gt.body.user?.country)
  const sv = await login('gerenteelsalvador@red.com', 'Salva2026str')
  check('Login gerente SV', sv.status === 200, sv.body.user?.country)

  const bad = await login('gerentegeneral@red.com', 'incorrecta')
  check('Contraseña incorrecta rechazada', bad.status === 401)
  const ghost = await login('noexiste@red.com', 'loquesea')
  check('Usuario inexistente rechazado', ghost.status === 401)
  check('No revela si el correo existe', bad.body.error === ghost.body.error)

  const noToken = await json('/api/requests')
  check('Sin token se rechaza', noToken.status === 401)
  const fakeToken = await json('/api/requests', { headers: auth('token.falso.xyz') })
  check('Token inválido se rechaza', fakeToken.status === 401)

  const listGeneral = await json('/api/requests?limit=1', { headers: auth(general.body.token) })
  const listSV = await json('/api/requests?limit=1', { headers: auth(sv.body.token) })
  const listGT = await json('/api/requests?limit=1', { headers: auth(gt.body.token) })
  check('Gerente general ve todo', listGeneral.body.total === after, `${listGeneral.body.total}`)
  check('Regionales ven solo su país',
    listSV.body.total + listGT.body.total === listGeneral.body.total,
    `SV ${listSV.body.total} + GT ${listGT.body.total}`)

  const injection = await json('/api/requests?country=GT&limit=5', { headers: auth(sv.body.token) })
  check('Un regional no amplía su alcance con ?country=',
    injection.body.total === listSV.body.total
      && injection.body.data.every((item) => item.country === 'SV'))

  const gtDoc = await Request.findOne({ country: 'GT' }).select('externalId').lean()
  const crossRead = await json(`/api/requests/${gtDoc.externalId}`, { headers: auth(sv.body.token) })
  check('Un regional no lee documentos de otro país', crossRead.status === 404)
  const crossWrite = await json(`/api/requests/${gtDoc.externalId}`, {
    method: 'PATCH', headers: auth(sv.body.token), body: JSON.stringify({ internalNotes: 'intruso' }),
  })
  check('Un regional no escribe en otro país', crossWrite.status === 404)

  // ---------------------------------------------------------------- 4
  section('4. CAMBIOS LOCALES Y PERSISTENCIA')

  const target = await Request.findOne({ localStatus: LOCAL_STATUS.PENDIENTE })
    .select('externalId').lean()
  const id = target.externalId
  const originalDoc = await Request.findOne({ externalId: id }).lean()

  const patched = await json(`/api/requests/${id}`, {
    method: 'PATCH', headers: auth(general.body.token),
    body: JSON.stringify({ localStatus: LOCAL_STATUS.APROBADA, internalNotes: 'Validación automática.' }),
  })
  check('Aprobar desde el panel', patched.status === 200
    && patched.body.localStatus === LOCAL_STATUS.APROBADA, id)
  check('La nota interna se guarda', patched.body.internalNotes === 'Validación automática.')
  check('Queda registrado quién decidió',
    patched.body.approvalDecidedBy === 'gerentegeneral@red.com'
    && patched.body.approvalDecidedVia === 'dashboard')

  const onDisk = await Request.findOne({ externalId: id }).lean()
  check('El cambio está en MongoDB, no en memoria',
    onDisk.localStatus === LOCAL_STATUS.APROBADA, `historial ${onDisk.approvalHistory.length}`)

  const rejected = await json(`/api/requests/${id}`, {
    method: 'PATCH', headers: auth(general.body.token),
    body: JSON.stringify({ localStatus: LOCAL_STATUS.NO_APROBADA }),
  })
  check('Desaprobar también funciona', rejected.body.localStatus === LOCAL_STATUS.NO_APROBADA)
  const histAfter = await Request.findOne({ externalId: id }).lean()
  check('El historial acumula cada decisión', histAfter.approvalHistory.length >= 2,
    `${histAfter.approvalHistory.length} entradas`)

  const invalid = await json(`/api/requests/${id}`, {
    method: 'PATCH', headers: auth(general.body.token),
    body: JSON.stringify({ localStatus: 'Inventado' }),
  })
  check('Estado inválido rechazado', invalid.status === 400)

  // La sincronizacion no pisa lo local
  await syncExternalApi({ countries: ['GT', 'SV'] })
  const survived = await Request.findOne({ externalId: id }).lean()
  check('La sincronización respeta el estado local',
    survived.localStatus === LOCAL_STATUS.NO_APROBADA)
  check('La sincronización respeta las notas y el historial',
    survived.internalNotes === 'Validación automática.'
    && survived.approvalHistory.length === histAfter.approvalHistory.length)
  check('La sincronización sí refresca los datos de la API',
    survived.clienteNombre === originalDoc.clienteNombre)

  // Borrado local y restauracion
  const deleted = await json(`/api/requests/${id}`, { method: 'DELETE', headers: auth(general.body.token) })
  check('Borrado local marca la bandera', deleted.status === 200 && deleted.body.deletedLocally === true)
  const hidden = await json(`/api/requests/${id}`, { headers: auth(general.body.token) })
  check('Lo borrado no aparece en las lecturas', hidden.status === 404)
  await syncExternalApi({ countries: ['GT'] })
  const stillDeleted = await Request.findOne({ externalId: id }).lean()
  check('El borrado sobrevive a la sincronización', stillDeleted.deletedLocally === true)
  const restored = await json(`/api/requests/${id}/restore`, { method: 'POST', headers: auth(general.body.token) })
  check('Restaurar funciona', restored.status === 200 && restored.body.deletedLocally === false)

  // ---------------------------------------------------------------- 5
  section('5. APROBACIÓN POR CORREO')

  if (sendEmail) {
    const mail = await json(`/api/requests/${id}/send-approval`, {
      method: 'POST', headers: auth(general.body.token),
      body: JSON.stringify({ additionalInfo: 'Correo de validación del sistema.' }),
    })
    check('Brevo envía el correo', mail.status === 200 && mail.body.sent === true,
      mail.body.messageId || mail.body.error)
    check('El correo va al destinatario configurado',
      mail.body.to === process.env.BREVO_EDUARDO_EMAIL, mail.body.to)
    check('El token tiene vencimiento', !!mail.body.expiresAt,
      mail.body.expiresAt ? new Date(mail.body.expiresAt).toLocaleString('es-GT') : '')
  } else {
    console.log('  [--]   Envío real omitido (usa --email para incluirlo)')
    check('Brevo configurado', !!process.env.BREVO_API_KEY
      && process.env.BREVO_API_KEY.startsWith('xkeysib-'))
  }

  const issued = await issueApprovalToken(id, 'eduardo@red.com')
  check('Se emite token de aprobación', issued.token.length === 64)
  const stored = await Request.findOne({ externalId: id }).select('+approvalTokenHash').lean()
  check('En la DB se guarda el hash, no el token', stored.approvalTokenHash !== issued.token)
  check('El enlace no expone el ID del documento', !issued.token.includes(id))

  const link = `${API}/api/requests/approve?token=${issued.token}&status=Aprobada`
  const click1 = await fetch(link)
  const html1 = await click1.text()
  check('El enlace sin sesión funciona', click1.status === 200 && html1.includes('Respuesta registrada'))
  const afterClick = await Request.findOne({ externalId: id }).lean()
  check('El clic cambia el estado en la DB', afterClick.localStatus === LOCAL_STATUS.APROBADA)
  check('Registra que vino del correo',
    afterClick.approvalDecidedVia === 'correo' && afterClick.approvalDecidedBy === 'eduardo@red.com')

  const click2 = await fetch(link)
  check('Segundo clic rechazado (un solo uso)', click2.status === 409,
    (await click2.text()).includes('ya fue utilizado') ? 'mensaje correcto' : '')
  const bogus = await fetch(`${API}/api/requests/approve?token=${'a'.repeat(64)}&status=Aprobada`)
  check('Token desconocido rechazado', bogus.status === 400)

  // ---------------------------------------------------------------- 6
  section('6. GESTIÓN DE USUARIOS')

  const usersList = await json('/api/users', { headers: auth(general.body.token) })
  check('El gerente general lista usuarios', usersList.status === 200,
    `${usersList.body.total} usuarios`)
  const usersDenied = await json('/api/users', { headers: auth(sv.body.token) })
  check('Un regional no accede a usuarios', usersDenied.status === 403)

  const nuevo = {
    name: 'Usuario Validación', email: 'validacion.temp@red.com',
    password: 'Temporal12345', role: 'GERENTE_REGIONAL', country: 'SV',
  }
  const created = await json('/api/users', {
    method: 'POST', headers: auth(general.body.token), body: JSON.stringify(nuevo),
  })
  check('Crear usuario', created.status === 201, created.body.email || created.body.error)
  const dup = await json('/api/users', {
    method: 'POST', headers: auth(general.body.token), body: JSON.stringify(nuevo),
  })
  check('Correo duplicado rechazado', dup.status === 409)
  const shortPass = await json('/api/users', {
    method: 'POST', headers: auth(general.body.token),
    body: JSON.stringify({ ...nuevo, email: 'otro@red.com', password: '123' }),
  })
  check('Contraseña corta rechazada', shortPass.status === 400)
  const noCountry = await json('/api/users', {
    method: 'POST', headers: auth(general.body.token),
    body: JSON.stringify({ ...nuevo, email: 'otro2@red.com', country: null }),
  })
  check('Regional sin país rechazado', noCountry.status === 400)

  const newLogin = await login(nuevo.email, nuevo.password)
  check('El usuario nuevo puede entrar', newLogin.status === 200)
  const newScope = await json('/api/requests?limit=1', { headers: auth(newLogin.body.token) })
  check('El usuario nuevo queda acotado a su país',
    newScope.body.total === listSV.body.total, `ve ${newScope.body.total}`)

  const hashed = await User.findOne({ email: nuevo.email }).select('+passwordHash').lean()
  check('La contraseña se guarda hasheada',
    hashed.passwordHash.startsWith('$2') && !hashed.passwordHash.includes(nuevo.password))

  const removed = await json(`/api/users/${created.body._id}`, {
    method: 'DELETE', headers: auth(general.body.token),
  })
  check('Eliminar usuario', removed.status === 200)

  // ---------------------------------------------------------------- 7
  section('7. LIMPIEZA')

  await Request.updateOne({ externalId: id }, {
    $set: {
      localStatus: originalDoc.localStatus,
      internalNotes: originalDoc.internalNotes,
      deletedLocally: originalDoc.deletedLocally,
      approvalDecidedBy: originalDoc.approvalDecidedBy,
      approvalDecidedVia: originalDoc.approvalDecidedVia,
      approvalDecidedAt: originalDoc.approvalDecidedAt,
      approvalHistory: originalDoc.approvalHistory ?? [],
      approvalTokenHash: null,
    },
  })
  const cleaned = await Request.findOne({ externalId: id }).lean()
  check('Registro de prueba restaurado', cleaned.localStatus === originalDoc.localStatus, id)
  const ghostUser = await User.findOne({ email: nuevo.email }).lean()
  check('Usuario de prueba eliminado', ghostUser === null)

  // ---------------------------------------------------------------- Resumen
  section('RESUMEN')
  const total = passed + failed
  console.log(`  Comprobaciones: ${total}`)
  console.log(`  Correctas:      ${passed}`)
  console.log(`  Fallidas:       ${failed}`)
  if (failed) {
    console.log('\n  Fallaron:')
    for (const item of failures) console.log(`    - ${item}`)
  }
  console.log(`\n  ${failed === 0 ? '>>> TODO FUNCIONA <<<' : '>>> HAY FALLAS, revisar arriba <<<'}\n`)

  await mongoose.disconnect()
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(async (error) => {
  console.error('\nError durante la validación:', error)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
