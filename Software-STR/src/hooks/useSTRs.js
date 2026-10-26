import { useCallback, useEffect, useState } from 'react'
import {
  getSTRs, sendApprovalEmail, updateLocalStatus, syncNow, getToken,
} from '../services/strService'

export function useSTRs(onSessionExpired) {
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

  // Persiste el estado en la DB y refleja la respuesta del servidor.
  const updateStatus = useCallback(async (id, estado) => {
    const updated = await updateLocalStatus(id, estado)
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

  return { strs, isLoading, error, updateStatus, requestApproval, sync, reload: loadSTRs }
}
