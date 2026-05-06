'use client'

import { useState, useEffect, useCallback } from 'react'
import { basePath } from '@/lib/basePath'

export interface Session {
  authenticated: boolean
  email: string | null
  userId: string | null
  userHash: string | null
  isHxUser: boolean
  hxToken: string | null
}

interface SessionState extends Session {
  loading: boolean
  refresh: () => void
}

export function useSession(): SessionState {
  const [state, setState] = useState<Session>({
    authenticated: false,
    email: null,
    userId: null,
    userHash: null,
    isHxUser: false,
    hxToken: null,
  })
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    setLoading(true)
    fetch(`${basePath}/api/auth/session`)
      .then(r => r.json())
      .then(data => {
        setState({
          authenticated: !!data.authenticated,
          email: data.email ?? null,
          userId: data.userId ?? null,
          userHash: data.userHash ?? null,
          isHxUser: !!data.isHxUser,
          hxToken: data.hxToken ?? null,
        })
      })
      .catch(() => {
        setState({ authenticated: false, email: null, userId: null, userHash: null, isHxUser: false, hxToken: null })
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return { ...state, loading, refresh }
}
