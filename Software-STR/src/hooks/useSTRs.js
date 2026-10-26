import { useCallback, useEffect, useState } from 'react'
import { getSTRs, sendApprovalEmail } from '../services/strService'

export function useSTRs() {
  const [strs, setSTRs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const loadSTRs = useCallback(async () => {
    setIsLoading(true)
    setError('')

    try {
      const data = await getSTRs()
      setSTRs(data)
    } catch {
      setError('No fue posible cargar las STRs.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadSTRs()
    }, 0)

    return () => window.clearTimeout(initialLoad)
  }, [loadSTRs])

  const updateStatus = useCallback((id, estado) => {
    setSTRs((current) =>
      current.map((str) => (str.id === id ? { ...str, estado } : str)),
    )
  }, [])

  const requestApproval = useCallback(async (str, additionalInfo) => {
    return sendApprovalEmail(str, additionalInfo)
  }, [])

  return { strs, isLoading, error, updateStatus, requestApproval, reload: loadSTRs }
}
