import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getSTRs, sendApprovalEmail, decideApproval, deferApproval, restoreApproval, syncNow, getToken,
} from '../services/strService'

// Cada cuanto se relee en silencio para detectar lo que se aprobo por correo.
const POLL_INTERVAL_MS = 6000

export function useSTRs(onSessionExpired, onStatusChange) {
  const [strs, setSTRs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const loadSTRs = useCallback(async () => {
    if (!getToken()) {
      setSTRs([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError('')

    try {
      setSTRs(await getSTRs())
    } catch (caught) {
      if (caught.message === 'SESSION_EXPIRED') {
        setSTRs([])
        onSessionExpired?.()
      } else {
        setError(caught.message || 'No fue posible cargar las solicitudes.')
      }
    } finally {
      setIsLoading(false)
    }
  }, [onSessionExpired])

  useEffect(() => {
    void loadSTRs()
  }, [loadSTRs])

  // Las decisiones llegan desde el correo, fuera del navegador, asi que la
  // unica forma de enterarse es releer. Se hace en silencio: sin spinner y sin
  // tocar isLoading, para que la tabla no parpadee cada seis segundos.
  const statusesRef = useRef(new Map())
  // El handler se guarda en un ref para que el intervalo no se reinicie cada
  // vez que el padre vuelve a renderizar con una funcion nueva.
  const changeHandler = useRef(onStatusChange)
  useEffect(() => {
    changeHandler.current = onStatusChange
  }, [onStatusChange])

  useEffect(() => {
    let cancelled = false

    async function poll() {
      if (!getToken()) return

      try {
        const fresh = await getSTRs()
        if (cancelled) return

        const previous = statusesRef.current
        const next = new Map(fresh.map((str) => [str.id, str.estado]))

        // En la primera pasada solo se toma la foto: avisar de todo lo que ya
        // estaba decidido al abrir la app seria ruido, no una novedad.
        if (previous.size) {
          for (const str of fresh) {
            const before = previous.get(str.id)
            if (before && before !== str.estado) changeHandler.current?.(str, before)
          }
        }

        statusesRef.current = next
        setSTRs(fresh)
      } catch { /* un fallo puntual no rompe el ciclo */ }
    }

    const timer = window.setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  // Persiste el estado en la DB y refleja la respuesta del servidor.
  const updateStatus = useCallback(async (id, estado, note) => {
    const updated = await decideApproval(id, estado, note)
    statusesRef.current.set(id, updated.estado)
    setSTRs((current) => current.map((str) => (str.id === id ? updated : str)))
    return updated
  }, [])

  const updateDeferred = useCallback(async (id, action) => {
    const update = action === 'defer' ? deferApproval : restoreApproval
    const updated = await update(id)
    setSTRs((current) => current.map((str) => (str.id === id ? updated : str)))
    return updated
  }, [])

  const requestApproval = useCallback(
    async (str, additionalInfo) => sendApprovalEmail(str, additionalInfo),
    [],
  )

  const sync = useCallback(async () => {
    const summary = await syncNow()
    await loadSTRs()
    return summary
  }, [loadSTRs])

  return { strs, isLoading, error, updateStatus, updateDeferred, requestApproval, sync, reload: loadSTRs }
}
