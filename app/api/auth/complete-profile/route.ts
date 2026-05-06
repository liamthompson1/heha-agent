import { NextRequest, NextResponse } from 'next/server'
import { completeProfile } from '@/lib/auth/hx-client'

export async function POST(req: NextRequest) {
  const { givenName, familyName, contactNumber } = await req.json().catch(() => ({}))

  const hxToken = req.cookies.get('hx_auth_session')?.value
    ?? req.cookies.get('hx_bearer_token')?.value

  if (!hxToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const success = await completeProfile(hxToken, {
      givenName: givenName || undefined,
      familyName: familyName || undefined,
      contactNumber: contactNumber || undefined,
    })
    return NextResponse.json({ success })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to save profile' }, { status: 502 })
  }
}
