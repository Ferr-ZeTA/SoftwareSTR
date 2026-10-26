import 'dotenv/config'
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const port = Number(process.env.PORT || 8787)
const brevoUrl = 'https://api.brevo.com/v3/smtp/email'
const dataFile = fileURLToPath(new URL('../data/strs.json', import.meta.url))
const authUsers = [
  {
    email: process.env.AUTH_GLOBAL_EMAIL || 'gerentegeneral@red.com',
    password: process.env.AUTH_GLOBAL_PASSWORD,
    role: 'global',
    country: null,
    name: 'Gerente general',
  },
  {
    email: 'gerenteguatemala@red.com',
    password: process.env.AUTH_GUATEMALA_PASSWORD,
    role: 'country',
    country: 'GT',
    name: 'Gerente Guatemala',
  },
  {
    email: 'gerenteelsalvador@red.com',
    password: process.env.AUTH_ELSALVADOR_PASSWORD,
    role: 'country',
    country: 'SV',
    name: 'Gerente El Salvador',
  },
]

async function getSTRs() {
  return JSON.parse(await readFile(dataFile, 'utf8'))
}

async function updateSTRStatus(id, status) {
  const strs = await getSTRs()
  const index = strs.findIndex((str) => str.id === id)
  if (index === -1) return false
  strs[index].estado = status
  await writeFile(dataFile, `${JSON.stringify(strs, null, 2)}\n`)
  return true
}

function json(response, status, payload) {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    'Content-Type': 'application/json',
  })
  response.end(JSON.stringify(payload))
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
      if (body.length > 1000000) reject(new Error('Request body is too large.'))
    })
    request.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'))
      } catch {
        reject(new Error('Invalid JSON body.'))
      }
    })
    request.on('error', reject)
  })
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[character]))
}

function approvalEmail({ str, additionalInfo }) {
  const approvalBaseUrl = process.env.APPROVAL_PUBLIC_URL || 'http://localhost:8787'
  const approveUrl = `${approvalBaseUrl}/api/approval-response?strId=${encodeURIComponent(str.id)}&status=Aprobada`
  const rejectUrl = `${approvalBaseUrl}/api/approval-response?strId=${encodeURIComponent(str.id)}&status=No%20Aprobada`
  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#19283b;border:1px solid #e5ebef;border-radius:12px;overflow:hidden">
      <div style="background:#11253d;padding:24px 30px;color:white"><div style="font-size:20px;font-weight:bold">STR<span style="color:#54c9b8">flow</span></div><div style="font-size:12px;color:#b6c5d4;margin-top:5px">Solicitud de aprobación</div></div>
      <div style="padding:30px">
        <h2 style="margin-top:0">Aprobación requerida: ${escapeHtml(str.id)}</h2>
        <p>Hola Eduardo, revisa la siguiente solicitud:</p>
        <div style="background:#f5f8fa;border:1px solid #e5ebef;border-radius:8px;padding:16px">
          <p><strong>Cliente:</strong> ${escapeHtml(str.cliente)}</p><p><strong>Detalle:</strong> ${escapeHtml(str.detalleSTR)}</p><p><strong>Responsable:</strong> ${escapeHtml(str.responsable)}</p><p><strong>Fecha:</strong> ${escapeHtml(str.fecha)}</p><p><strong>Estado actual:</strong> ${escapeHtml(str.estado)}</p>
        </div>
        <p><strong>Información adicional</strong></p><p style="white-space:pre-wrap;color:#526276">${escapeHtml(additionalInfo || 'Sin información adicional.')}</p>
        <p style="margin-top:28px"><a href="${approveUrl}" style="background:#e1f6f0;color:#188a74;padding:13px 22px;border-radius:6px;text-decoration:none;font-weight:bold;margin-right:10px">Sí apruebo</a><a href="${rejectUrl}" style="background:#fcecef;color:#c0525e;padding:13px 22px;border-radius:6px;text-decoration:none;font-weight:bold">No apruebo</a></p>
      </div>
    </div>
  `
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    })
    return response.end()
  }

  if (request.method === 'GET' && request.url.startsWith('/api/external/strs')) {
    const query = new URL(request.url, `http://${request.headers.host}`).searchParams
    const apiKey = query.get('api_key')
    if (!process.env.EXTERNAL_API_KEY || apiKey !== process.env.EXTERNAL_API_KEY) {
      return json(response, 401, { error: 'API key inválida o ausente.' })
    }
    try {
      const strs = await getSTRs()
      return json(response, 200, {
        data: strs,
        count: strs.length,
      })
    } catch (error) {
      return json(response, 500, { error: error.message })
    }
  }

  if (request.method === 'POST' && request.url === '/api/auth/login') {
    try {
      const { email, password } = await readBody(request)
      const user = authUsers.find((account) => account.email.toLowerCase() === String(email || '').trim().toLowerCase() && account.password && account.password === password)
      if (!user) return json(response, 401, { error: 'Correo o contraseña incorrectos.' })
      return json(response, 200, { user: { email: user.email, role: user.role, country: user.country, name: user.name } })
    } catch (error) {
      return json(response, 400, { error: error.message })
    }
  }

  if (request.method === 'GET' && request.url === '/api/strs') {
    try {
      return json(response, 200, await getSTRs())
    } catch (error) {
      return json(response, 500, { error: error.message })
    }
  }

  if (request.method === 'POST' && request.url === '/api/send-approval') {
    try {
      const { str, additionalInfo } = await readBody(request)
      if (!str?.id || !str?.cliente || !str?.detalleSTR) {
        return json(response, 400, { error: 'La STR no contiene la información requerida.' })
      }
      if (!process.env.BREVO_API_KEY || !process.env.BREVO_EDUARDO_EMAIL || !process.env.BREVO_SENDER_EMAIL) {
        return json(response, 500, { error: 'Configura BREVO_API_KEY, BREVO_EDUARDO_EMAIL y BREVO_SENDER_EMAIL en el archivo .env.' })
      }

      const brevoResponse = await fetch(brevoUrl, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': process.env.BREVO_API_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || 'STRflow' },
          to: [{ email: process.env.BREVO_EDUARDO_EMAIL, name: 'Eduardo' }],
          subject: `Aprobación requerida: ${str.id}`,
          htmlContent: approvalEmail({ str, additionalInfo }),
        }),
      })
      const brevoPayload = await brevoResponse.json()
      if (!brevoResponse.ok) return json(response, brevoResponse.status, { error: brevoPayload.message || 'Brevo rechazó el envío.' })
      return json(response, 200, { sent: true, messageId: brevoPayload.messageId })
    } catch (error) {
      return json(response, 500, { error: error.message })
    }
  }

  if (request.method === 'GET' && request.url.startsWith('/api/approval-response')) {
    const query = new URL(request.url, `http://${request.headers.host}`).searchParams
    const strId = query.get('strId')
    const status = query.get('status')
    if (!strId || !['Aprobada', 'No Aprobada'].includes(status)) {
      response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
      return response.end('<h1>Respuesta inválida</h1><p>El enlace de aprobación no es válido.</p>')
    }
    try {
      const updated = await updateSTRStatus(strId, status)
      response.writeHead(updated ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' })
      return response.end(`<div style="font-family:Arial;max-width:520px;margin:80px auto;text-align:center;color:#19283b"><div style="width:64px;height:64px;margin:auto;background:#e1f6f0;border-radius:50%;display:grid;place-items:center;color:#168d77;font-size:32px">✓</div><h1 style="margin-bottom:8px">Respuesta registrada</h1><p>${updated ? `La solicitud <strong>${escapeHtml(strId)}</strong> fue marcada como <strong>${escapeHtml(status)}</strong>.` : 'No se encontró la solicitud.'}</p><p style="color:#7c8b9a">Puedes cerrar esta ventana y actualizar el dashboard.</p></div>`)
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
      return response.end(`<h1>Error al guardar la respuesta</h1><p>${escapeHtml(error.message)}</p>`)
    }
  }

  json(response, 404, { error: 'Ruta no encontrada.' })
})

server.listen(port, () => console.log(`STRflow API listening on http://localhost:${port}`))
