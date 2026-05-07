import { SignJWT, jwtVerify } from 'jose'
import type { SessionData } from './types'

const COOKIE_NAME = 'heha_session'

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  return new TextEncoder().encode(secret)
}

export async function createSession(data: SessionData): Promise<string> {
  return new SignJWT({ ...data })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecretKey())
}

export async function getSession(cookieValue: string | undefined): Promise<SessionData | null> {
  if (!cookieValue) return null
  try {
    const { payload } = await jwtVerify(cookieValue, getSecretKey())
    return payload as unknown as SessionData
  } catch {
    return null
  }
}

export function getSessionCookieName(): string {
  return COOKIE_NAME
}

export function sessionCookieOptions(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  }
}

export function clearSessionCookieOptions() {
  return { name: COOKIE_NAME, value: '', httpOnly: true, path: '/', maxAge: 0 }
}

export async function hashEmail(email: string): Promise<string> {
  const data = new TextEncoder().encode(email.toLowerCase().trim())
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function getHxAuthToken(getCookie: (name: string) => string | undefined): string | null {
  return getCookie('auth_token') ?? getCookie('auth_session') ?? null
}

/** Returns the agent retailToken if the request belongs to a B2B agent session. */
export function getAgentRetailToken(getCookie: (name: string) => string | undefined): string | null {
  return getCookie('hx_retail_token') ?? null
}
