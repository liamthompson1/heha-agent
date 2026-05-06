import { NextResponse } from 'next/server'
import { clearSessionCookieOptions } from '@/lib/auth/session'

export async function POST() {
  const opts = clearSessionCookieOptions()
  const res = NextResponse.json({ success: true })

  res.cookies.set(opts.name, opts.value, { httpOnly: opts.httpOnly, path: opts.path, maxAge: opts.maxAge })

  for (const name of ['hx_bearer_token', 'hx_auth_session', 'auth_session', 'hx_user_id']) {
    res.cookies.set(name, '', { httpOnly: true, path: '/', maxAge: 0 })
  }

  return res
}
