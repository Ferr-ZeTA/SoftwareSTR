import { LOCAL_STATUS } from '../models/Request.js'

// La API externa que ya usamos es de solo lectura (GET de traslados). Para
// registrar la autorizacion en SAP hace falta un POST que todavia no existe:
// lo construye Camilo. Todo el contrato con el vive en este archivo, asi que
// cuando lo entregue solo se toca `callSapEndpoint`.
//
// Las credenciales las escribe quien aprueba, en el formulario del correo:
// pasan de ahi al endpoint y no se guardan ni se registran en ningun lado.
const ENDPOINT = process.env.SAP_APPROVAL_URL || ''
const ENABLED = process.env.SAP_APPROVAL_ENABLED === 'true'

function decisionToSap(localStatus) {
  return localStatus === LOCAL_STATUS.APROBADA ? 'A' : 'R'
}

// --- Unico punto de contacto con el endpoint de Camilo -----------------------
// CONTRATO PENDIENTE: faltan la URL, la forma del body, como autentica y que
// devuelve. Lo de abajo es la suposicion de trabajo, no algo acordado.
async function callSapEndpoint({ request, status, sapUser, sapPassword, motivo }) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Se asume la misma llave del GET mientras no diga lo contrario.
      'X-API-Key': process.env.EXTERNAL_API_KEY || '',
    },
    body: JSON.stringify({
      documento: request.documento,
      pais: request.country,
      tiposolicitud: request.tipoSolicitud,
      decision: decisionToSap(status),
      usuario: sapUser,
      clave: sapPassword,
      motivo,
    }),
  })

  const payload = await response.json().catch(() => ({}))

  if (response.ok) {
    return { ok: true, code: 'ok', message: payload.message || 'Autorización registrada en SAP.' }
  }
  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      code: 'credenciales',
      retryable: true,
      message: payload.message || 'SAP no aceptó ese usuario o esa clave.',
    }
  }
  if (response.status === 409) {
    // Ya estaba resuelto del lado de SAP: no es un fallo.
    return { ok: true, code: 'ya_autorizado', message: payload.message || 'SAP ya tenía esta decisión registrada.' }
  }
  if (response.status >= 500) {
    return {
      ok: false,
      code: 'sap_caido',
      retryable: true,
      message: payload.message || `SAP respondió ${response.status}. Intentá de nuevo en un momento.`,
    }
  }
  return { ok: false, code: 'sap_error', retryable: false, message: payload.message || `SAP respondió ${response.status}.` }
}

// Registra la decision en SAP. Sin endpoint configurado corre en seco, para
// poder recorrer y revisar el flujo completo antes de tener el contrato.
export async function authorizeInSap({ request, status, sapUser, sapPassword, motivo = '' }) {
  if (!sapUser || !sapPassword) {
    return { ok: false, code: 'faltan_datos', retryable: true, message: 'Escribí tu usuario y tu clave de SAP.' }
  }

  if (!ENABLED || !ENDPOINT) {
    return {
      ok: true,
      code: 'simulado',
      message: `Simulación: se enviaría ${decisionToSap(status)} para el documento `
        + `${request.documento} (${request.country}) como ${sapUser}.`,
    }
  }

  try {
    return await callSapEndpoint({ request, status, sapUser, sapPassword, motivo })
  } catch (error) {
    return {
      ok: false,
      code: 'sin_conexion',
      retryable: true,
      message: `No se pudo contactar a SAP: ${error.message}`,
    }
  }
}
