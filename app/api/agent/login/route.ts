import { NextResponse } from 'next/server'
import { signInAgent } from '@/lib/auth/hx-agent-client'
import { createSession, sessionCookieOptions, hashEmail } from '@/lib/auth/session'
import type { SessionData } from '@/lib/auth/types'

// HX agent session cookies live for 30 days (matches the holidayextras.com `session` cookie).
const HX_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

const HX_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: HX_COOKIE_MAX_AGE,
}

export async function POST(req: Request) {
  const { abtaNum, password, initials } = await req.json().catch(() => ({}))

  if (typeof abtaNum !== 'string' || !abtaNum.trim() ||
      typeof password !== 'string' || !password ||
      typeof initials !== 'string' || !initials.trim()) {
    return NextResponse.json({ error: 'ABTA number, password, and initials are required' }, { status: 400 })
  }

  const trimmedAbta = abtaNum.trim()
  const trimmedInitials = initials.trim().toUpperCase()

  let result
  try {
    result = await signInAgent(trimmedAbta, password, trimmedInitials)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Login failed' },
      { status: 502 },
    )
  }

  if (!result) {
    return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 })
  }

  // Identity is `<AGENTCODE>:<INITIALS>` — stable per-agent-user, no PII.
  const identity = `${result.agentCode}:${trimmedInitials}`
  const userHash = await hashEmail(identity)

  const sessionData: SessionData = {
    userId: userHash,
    userHash,
    isAuthenticated: true,
    isAgent: true,
    agentCode: result.agentCode,
    initials: trimmedInitials,
    retailToken: result.retailToken,
  }
  const token = await createSession(sessionData)
  const cookieOpts = sessionCookieOptions(token)

  const response = NextResponse.json({
    success: true,
    agentCode: result.agentCode,
    initials: trimmedInitials,
  })

  // Our app session JWT.
  response.cookies.set(cookieOpts.name, cookieOpts.value, {
    httpOnly: cookieOpts.httpOnly,
    secure: cookieOpts.secure,
    sameSite: cookieOpts.sameSite,
    path: cookieOpts.path,
    maxAge: cookieOpts.maxAge,
  })

  // Mirror the HX cookies as first-party cookies on agent.heha.ai so server
  // routes can replay them when proxying calls back to holidayextras.com.
  response.cookies.set('hx_retail_token', result.retailToken, HX_COOKIE_OPTS)
  response.cookies.set('hx_agent_code', result.agentCode, HX_COOKIE_OPTS)
  if (result.agentData) response.cookies.set('hx_agent_data', result.agentData, HX_COOKIE_OPTS)
  if (result.sessionId) response.cookies.set('hx_agent_session', result.sessionId, HX_COOKIE_OPTS)
  response.cookies.set('hx_user_id', userHash, HX_COOKIE_OPTS)

  return response
}
