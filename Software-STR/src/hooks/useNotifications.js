import { useCallback, useMemo, useRef, useState } from 'react'
import { playChime } from '../services/notificationSound'

// Cuanto vive cada aviso en pantalla. Las prioritarias no se van solas:
// ocupan la pantalla y se cierran a mano, porque anuncian una decision que
// hay que acusar de recibido.
const DEFAULT_DURATION = { success: 4000, info: 3500, error: 6000, priority: 0 }

// El historial se corta: es una bitacora de lo reciente, no un registro.
const HISTORY_LIMIT = 40

let nextId = 0

export function useNotifications() {
  // `live` son los toasts visibles; `history` es todo lo que ha pasado.
  const [live, setLive] = useState([])
  const [history, setHistory] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
    setLive((current) => current.filter((item) => item.id !== id))
  }, [])

  const notify = useCallback((input) => {
    const notification = {
      id: (nextId += 1),
      variant: 'info',
      title: '',
      message: '',
      silent: false,
      at: Date.now(),
      ...(typeof input === 'string' ? { message: input } : input),
    }

    setLive((current) => [...current, notification].slice(-4))
    setHistory((current) => [{ ...notification, read: false }, ...current].slice(0, HISTORY_LIMIT))

    if (!notification.silent) {
      // Una prioritaria puede ser buena o mala noticia, asi que el chime lo
      // decide quien notifica, no la variante.
      playChime(notification.sound ?? (notification.variant === 'priority' ? 'success' : notification.variant))
    }

    const duration = notification.duration ?? DEFAULT_DURATION[notification.variant] ?? 3500
    if (duration > 0) {
      timers.current.set(notification.id, window.setTimeout(() => dismiss(notification.id), duration))
    }

    return notification.id
  }, [dismiss])

  const markAllRead = useCallback(() => {
    setHistory((current) => current.map((item) => (item.read ? item : { ...item, read: true })))
  }, [])

  const clearHistory = useCallback(() => setHistory([]), [])

  const unread = useMemo(() => history.reduce((total, item) => total + (item.read ? 0 : 1), 0), [history])

  return { notifications: live, history, unread, notify, dismiss, markAllRead, clearHistory }
}
