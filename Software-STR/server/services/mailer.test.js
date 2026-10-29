// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getBrevoConfigError, getBrevoConfigStatus } from './mailer.js'

describe('configuración de Brevo', () => {
  it('identifica variables ausentes o vacías sin revelar sus valores', () => {
    const env = {
      BREVO_API_KEY: '   ',
      BREVO_EDUARDO_EMAIL: '',
      BREVO_SENDER_EMAIL: 'sender@example.com',
    }

    expect(getBrevoConfigStatus(env)).toEqual({
      BREVO_API_KEY: false,
      BREVO_EDUARDO_EMAIL: false,
      BREVO_SENDER_EMAIL: true,
    })
    expect(getBrevoConfigError(env)).toContain('BREVO_API_KEY, BREVO_EDUARDO_EMAIL')
    expect(getBrevoConfigError(env)).not.toContain('sender@example.com')
  })

  it('no reporta error si todas las variables tienen contenido', () => {
    const env = {
      BREVO_API_KEY: ' api-key ',
      BREVO_EDUARDO_EMAIL: ' recipient@example.com ',
      BREVO_SENDER_EMAIL: ' sender@example.com ',
    }

    expect(getBrevoConfigError(env)).toBeNull()
  })
})
