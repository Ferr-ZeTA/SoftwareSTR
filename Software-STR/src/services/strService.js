const apiUrl = import.meta.env.VITE_STR_API_URL || '/api/strs'

export async function getSTRs() {
  const response = await fetch(apiUrl)
  if (!response.ok) {
    throw new Error(`STR API respondió con ${response.status}`)
  }
  return response.json()
}

export async function login(email, password) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'Credenciales inválidas.')
  return payload.user
}

export async function sendApprovalEmail(str, additionalInfo) {
  const response = await fetch('/api/send-approval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ str, additionalInfo }),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error || 'No fue posible enviar el correo.')
  }

  return response.json()
}
