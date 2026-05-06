import { NextResponse } from 'next/server'
import { verifyOtp } from '@/lib/auth/hx-client'
import { createSession, sessionCookieOptions, hashEmail } from '@/lib/auth/session'
import type { SessionData } from '@/lib/auth/types'

const HX_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 7,
}

export async function POST(req: Request) {
  const { email, otp } = await req.json().catch(() => ({}))

  if (!email || !otp) {
    return NextResponse.json({ error: 'email and otp required' }, { status: 400 })
  }

  try {
    const { data, cookies } = await verifyOtp(email, otp)

    if (!data.success) {
      return NextResponse.json({ success: false, error: 'Invalid OTP' }, { status: 401 })
    }

    const userHash = await hashEmail(email)
    const sessionData: SessionData = {
      email: email.toLowerCase().trim(),
      userId: userHash,
      userHash,
      isAuthenticated: true,
    }
    const token = await createSession(sessionData)
    const cookieOpts = sessionCookieOptions(token)

    const response = NextResponse.json({ success: true })

    // Our session cookie
    response.cookies.set(cookieOpts.name, cookieOpts.value, {
      httpOnly: cookieOpts.httpOnly,
      secure: cookieOpts.secure,
      sameSite: cookieOpts.sameSite,
      path: cookieOpts.path,
      maxAge: cookieOpts.maxAge,
    })

    // Extract auth_session from HX Set-Cookie and store it under our own cookie name
    for (const setCookie of cookies) {
      const match = setCookie.match(/^auth_session=([^;]+)/)
      if (match) {
        response.cookies.set('hx_auth_session', match[1], HX_COOKIE_OPTS)
        break
      }
    }

    // Store firebaseToken as fallback HX auth
    if (data.firebaseToken) {
      response.cookies.set('hx_bearer_token', data.firebaseToken, HX_COOKIE_OPTS)
    }

    response.cookies.set('hx_user_id', userHash, HX_COOKIE_OPTS)

    return response
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Verification failed' }, { status: 502 })
  }
}
