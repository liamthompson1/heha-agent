'use client'

import { useEffect, useRef } from 'react'
import * as Orion from '@/lib/orion'
import { basePath } from '@/lib/basePath'

/**
 * Subscribes to real-time story change notifications via SSE.
 * The /api/notifications route proxies the HX Socket.IO connection
 * server-side (with Cookie auth), forwarding story_change events as SSE.
 *
 * EventSource auto-reconnects on disconnect — the server heartbeats
 * every 25s to keep Vercel from killing the streaming response early.
 *
 * onChanged is kept in a ref so the SSE connection only reconnects
 * when resourcePath or hxToken changes.
 */
export function useStorySocket(
  resourcePath: string,
  hxToken: string | null,
  onChanged: () => void,
) {
  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged

  useEffect(() => {
    // Only connect when authenticated as an HX user
    if (!resourcePath || !hxToken) return

    const url = `${basePath}/api/notifications?resourcePath=${encodeURIComponent(resourcePath)}`
    const source = new EventSource(url)

    source.addEventListener('story_change', () => onChangedRef.current())
    source.addEventListener('error', () => {
      Orion.trackError('SSE connection error', 'sse_error', { source: 'client', customerFacing: false })
    })

    return () => {
      source.close()
    }
  }, [resourcePath, hxToken])
}
