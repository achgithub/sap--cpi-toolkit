import { useState } from 'react'

interface WorkerState<T> {
  data: T | null
  error: string | null
  loading: boolean
}

// useWorker provides a simple wrapper for POST requests to the worker API.
export function useWorker<TReq, TRes>() {
  const [state, setState] = useState<WorkerState<TRes>>({
    data: null,
    error: null,
    loading: false,
  })

  const post = async (path: string, body: TReq): Promise<TRes | null> => {
    setState({ data: null, error: null, loading: true })
    try {
      const resp = await fetch(`/api/worker${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await resp.json()
      if (!resp.ok) {
        setState({ data: null, error: json.error ?? `HTTP ${resp.status}`, loading: false })
        return null
      }
      setState({ data: json, error: null, loading: false })
      return json as TRes
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error'
      setState({ data: null, error: msg, loading: false })
      return null
    }
  }

  return { ...state, post }
}
