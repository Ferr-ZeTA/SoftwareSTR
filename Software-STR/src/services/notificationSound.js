// Un chime corto sintetizado con WebAudio. Se genera en vivo en vez de cargar
// un base64 para no sumar peso al bundle ni depender de un formato que el
// navegador tenga que decodificar.
const MUTE_KEY = 'strflow-sound-muted'

let context = null

export function isMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === 'true'
  } catch {
    return false
  }
}

export function setMuted(muted) {
  try {
    localStorage.setItem(MUTE_KEY, String(muted))
  } catch { /* localStorage bloqueado */ }
}

// El contexto se crea perezosamente: los navegadores lo dejan suspendido
// hasta que hay un gesto del usuario, y crearlo al cargar ensucia la consola.
function audioContext() {
  const Ctor = window.AudioContext || window.webkitAudioContext
  if (!Ctor) return null
  if (!context) context = new Ctor()
  if (context.state === 'suspended') void context.resume()
  return context
}

function tone(ctx, { frequency, startAt, duration, peak }) {
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()

  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(frequency, startAt)

  // Envolvente suave: un ataque corto y una caida exponencial evitan el
  // "clic" que deja un gain que arranca o termina de golpe.
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)

  oscillator.connect(gain).connect(ctx.destination)
  oscillator.start(startAt)
  oscillator.stop(startAt + duration + 0.02)
}

const CHIMES = {
  // Dos notas ascendentes (La5 -> Do#6): se lee como "algo bueno paso".
  success: [
    { frequency: 880, duration: 0.17, peak: 0.16, offset: 0 },
    { frequency: 1108.73, duration: 0.3, peak: 0.13, offset: 0.1 },
  ],
  // Una sola nota grave y breve, para avisos que no celebran nada.
  info: [{ frequency: 523.25, duration: 0.16, peak: 0.1, offset: 0 }],
  // Dos notas descendentes para el error.
  error: [
    { frequency: 440, duration: 0.18, peak: 0.13, offset: 0 },
    { frequency: 329.63, duration: 0.26, peak: 0.11, offset: 0.11 },
  ],
}

export function playChime(variant = 'info') {
  if (isMuted()) return

  try {
    const ctx = audioContext()
    if (!ctx) return

    const now = ctx.currentTime
    for (const note of CHIMES[variant] ?? CHIMES.info) {
      tone(ctx, {
        frequency: note.frequency,
        startAt: now + note.offset,
        duration: note.duration,
        peak: note.peak,
      })
    }
  } catch { /* sin audio disponible: la notificacion visual basta */ }
}
