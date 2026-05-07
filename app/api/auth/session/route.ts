import { NextRequest, NextResponse } from 'next/server'
import { getSession, getSessionCookieName, getHxAuthToken, getAgentRetailToken, createSession, sessionCookieOptions, hashEmail } from '@/lib/auth/session'
import { getCustomerFromToken } from '@/lib/auth/hx-client'
import type { SessionData } from '@/lib/auth/types'

export async function GET(req: NextRequest) {
  const cookieValue = req.cookies.get(getSessionCookieName())?.value
  const session = await getSession(cookieValue)
  const hxToken = getHxAuthToken(name => req.cookies.get(name)?.value)
  const retailToken = getAgentRetailToken(name => req.cookies.get(name)?.value)

  if (session?.isAuthenticated) {
    return NextResponse.json({
      authenticated: true,
      email: session.email ?? null,
      userId: session.userId,
      userHash: session.userHash,
      isHxUser: !!hxToken,
      hxToken,
      isAgent: !!session.isAgent,
      agentCode: session.agentCode ?? null,
      initials: session.initials ?? null,
      retailToken: session.retailToken ?? retailToken ?? null,
    })
  }

  // No app session — try to auto-authenticate from the HX cookie (same domain)
  if (hxToken) {
    const customer = await getCustomerFromToken(hxToken)
    if (customer) {
      const userHash = await hashEmail(customer.email)
      const sessionData: SessionData = { email: customer.email, userId: userHash, userHash, isAuthenticated: true }
      const token = await createSession(sessionData)
      const opts = sessionCookieOptions(token)
      const response = NextResponse.json({ authenticated: true, email: customer.email, userId: userHash, userHash, isHxUser: true, hxToken })
      response.cookies.set(opts.name, opts.value, { httpOnly: opts.httpOnly, secure: opts.secure, sameSite: opts.sameSite, path: opts.path, maxAge: opts.maxAge })
      return response
    }
  }

  return NextResponse.json({ authenticated: false })
}
