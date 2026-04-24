import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

export interface ServiceKey {
  oauth: {
    createdate?: string
    clientid: string
    clientsecret: string
    tokenurl: string
    url: string
  }
}

export type SystemType = 'TRL' | 'SBX' | 'DEV' | 'QAS' | 'PPD' | 'PRD'

export interface CPIInstance {
  id: string
  name: string
  system_type: SystemType
  api_key: ServiceKey | null
  pi_key: ServiceKey | null
  created_at: string
  updated_at: string
}

interface CPIInstanceContextValue {
  instances: CPIInstance[]
  selectedInstance: CPIInstance | null
  selectedId: string
  setSelectedId: (id: string) => void
  refresh: () => Promise<void>
}

const CPIInstanceContext = createContext<CPIInstanceContextValue>({
  instances: [],
  selectedInstance: null,
  selectedId: '',
  setSelectedId: () => {},
  refresh: async () => {},
})

export function CPIInstanceProvider({ children }: { children: ReactNode }) {
  const [instances, setInstances] = useState<CPIInstance[]>([])
  const [selectedId, setSelectedId] = useState('')

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/worker/cpi-instances')
      if (!res.ok) return
      const data: CPIInstance[] = await res.json() ?? []
      setInstances(data)
      setSelectedId(prev => {
        if (prev && data.some(i => i.id === prev)) return prev
        return data[0]?.id ?? ''
      })
    } catch {
      // instances may not be configured yet — fail silently
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const selectedInstance = instances.find(i => i.id === selectedId) ?? null

  return (
    <CPIInstanceContext.Provider value={{ instances, selectedInstance, selectedId, setSelectedId, refresh }}>
      {children}
    </CPIInstanceContext.Provider>
  )
}

export function useCPIInstance() {
  return useContext(CPIInstanceContext)
}
