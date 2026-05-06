import { NextRequest } from 'next/server'

/**
 * Extracts the HX auth token from the incoming request cookies.
 * Checks named cookies first, then falls back to any hx_ prefixed cookie.
 */
export function extractAuthToken(req: NextRequest): string | null {
  const named = ['auth_token', 'auth_session']
  for (const name of named) {
    const value = req.cookies.get(name)?.value
    if (value) {
      try { return decodeURIComponent(value) } catch { return value }
    }
  }
  return null
}
