import { NextRequest } from 'next/server'
import { extractAuthToken } from '@/lib/auth/extract-token'

// Must run on Node.js — socket.io-client uses Node APIs
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SOCKET_URL = 'https://apigw.holidayextras.com'
const SOCKET_PATH = '/customer-web/v1/notifications/realtime/socket.io'
const SOCKET_API_KEY = '2M1pvPbAEvsQnfAbJM6RAjiw7VN2UIDDfAEJZyr5p71OLkyE'

function sse(type: string, data: string) {
  return `event: ${type}\ndata: ${data}\n\n`
}

export async function GET(req: NextRequest) {
  const resourcePath = req.nextUrl.searchParams.get('resourcePath') ?? ''
  const authToken = extractAuthToken(req)

  console.log('[notifications] SSE opened, resourcePath:', resourcePath, 'hasToken:', !!authToken)

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (s: string) => { try { controller.enqueue(encoder.encode(s)) } catch { /* closed */ } }

      // Dynamically import so the module is only loaded on Node runtime
      const { io } = await import('socket.io-client')

      const cookieParts = [`api_key=${SOCKET_API_KEY}`]
      if (authToken) cookieParts.push(`auth_token=${authToken}`, `auth_session=${authToken}`)
      const cookie = cookieParts.join('; ')

      // WebSocket-only — polling creates unreliable nested HTTP requests inside
      // a Vercel streaming function. extraHeaders works fine on Node.js WebSocket.
      const socket = io(SOCKET_URL, {
        path: SOCKET_PATH,
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        extraHeaders: { Cookie: cookie },
      })

      socket.on('connect', () => {
        console.log('[notifications] socket connected, id:', socket.id)
      })

      socket.on('story_change', (payload: unknown) => {
        const p = payload as Record<string, unknown>
        const patterns = (p?.resourcePaths as string[]) ?? []
        console.log('[notifications] story_change, patterns:', patterns, 'resourcePath:', resourcePath)
        // HX patterns expect a leading slash; our resourcePath omits it
        const pathWithSlash = '/' + resourcePath
        const matched = patterns.length === 0 || patterns.some(pattern => {
          try { return new RegExp(pattern).test(pathWithSlash) } catch { return false }
        })
        if (!matched) return
        enqueue(sse('story_change', JSON.stringify({ resourcePaths: patterns })))
      })

      socket.on('connect_error', (err) => {
        console.warn('[notifications] socket connect_error:', err.message)
      })

      socket.on('disconnect', (reason) => {
        console.log('[notifications] socket disconnected:', reason)
      })

      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        socket.disconnect()
        try { controller.close() } catch { /* already closed */ }
      })

      // Flush headers immediately, then heartbeat to survive Vercel's idle timeout
      enqueue(': connected\n\n')
      const heartbeat = setInterval(() => enqueue(': heartbeat\n\n'), 25_000)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  })
}
