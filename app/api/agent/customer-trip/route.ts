/**
 * Agent → "Save trip for customer" endpoint.
 *
 * The Traveller GraphQL `createTrip` requires a customer `auth_session`. Agents
 * (B2B retail staff) don't have one — but for *new* email addresses we can mint
 * one silently using the same primitives the customer-OTP flow uses:
 *
 *   1. Verify caller is a logged-in agent (heha_session JWT, isAgent:true).
 *   2. createCustomerAccount(email, randomPassword)        ← creates HX customer
 *   3. signInCustomerWithEmailAndPassword(email, password) ← Set-Cookie auth_session
 *   4. createTrip(trip, agentCode) using that auth_session ← trip lands on customer
 *
 * If the email already has an HX account, we can't act on the customer's behalf
 * (per requirements) — return 409 customer_exists. The UI tells the agent the
 * customer must log in themselves to attach the trip.
 *
 * Mirrors the iOS staging flow on heha-ios (`HEHAAuthService.requestOTP` / new
 * email branch + `createCustomerAccount`).
 */

import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getSession, getSessionCookieName } from '@/lib/auth/session'
import { createAccountAndSignIn } from '@/lib/auth/hx-client'

const TRAVELLER_API = 'https://traveller-api.dock-yard.io/graphql'

// Booking-channel attribution. Matches heha-app/web + heha-ios production
// (memory: hx_traveller_graphql.md → "Production uses AC001 across all clients").
const AGENT_CODE = 'AC001'

export async function POST(req: NextRequest) {
  // ── 1. Agent-session gate ────────────────────────────────────────────────────
  const cookieValue = req.cookies.get(getSessionCookieName())?.value
  const session = await getSession(cookieValue)
  if (!session?.isAuthenticated || !session.isAgent) {
    return NextResponse.json({ error: 'Agent login required' }, { status: 401 })
  }

  // ── 2. Validate input ────────────────────────────────────────────────────────
  const body = await req.json().catch(() => ({}))
  const { email, name, fromDate, toDate, outboundFlightReference, inboundFlightReference } = body ?? {}
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid customer email required' }, { status: 400 })
  }
  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Trip name required' }, { status: 400 })
  }
  if (typeof fromDate !== 'string' || typeof toDate !== 'string') {
    return NextResponse.json({ error: 'fromDate and toDate required' }, { status: 400 })
  }

  // ── 3. Silently create the HX customer + grab their auth_session ─────────────
  let customerAuthSession: string | null = null
  try {
    const password = randomBytes(16).toString('base64url')
    const { cookies } = await createAccountAndSignIn(email.trim(), password)
    for (const setCookie of cookies) {
      const m = setCookie.match(/^auth_session=([^;]+)/)
      if (m) { customerAuthSession = m[1]; break }
    }
  } catch (e) {
    // The customer-OTP flow (app/api/auth/request-otp) treats *any* throw from
    // createAccountAndSignIn as "account already exists" — HX returns generic
    // messages like "Failed to create user" rather than something explicit. We
    // mirror that assumption here. Genuine upstream outages are rare and would
    // also produce a "you can't create them" outcome from the UI's perspective.
    console.warn('[agent/customer-trip] createAccountAndSignIn threw:', e instanceof Error ? e.message : e)
    return NextResponse.json({
      error: 'customer_exists',
      message: 'This email already has a Holiday Extras account, or the account couldn\'t be created. Ask the customer to sign in themselves to add this trip.',
    }, { status: 409 })
  }

  if (!customerAuthSession) {
    return NextResponse.json({ error: 'Customer sign-in returned no session' }, { status: 502 })
  }

  // ── 4. Create the trip on the customer's account ────────────────────────────
  // `fromDate`/`toDate` are DateTime scalars: must be full ISO 8601 (memory note).
  const tripInput: Record<string, string> = {
    name: name.trim(),
    fromDate: fromDate.includes('T') ? fromDate : `${fromDate}T00:00:00.000Z`,
    toDate:   toDate.includes('T')   ? toDate   : `${toDate}T00:00:00.000Z`,
  }
  if (outboundFlightReference) tripInput.outboundFlightReference = outboundFlightReference
  if (inboundFlightReference)  tripInput.inboundFlightReference  = inboundFlightReference

  const tripRes = await fetch(TRAVELLER_API, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${customerAuthSession}`,
      'Cookie':        `auth_session=${customerAuthSession}`,
    },
    body: JSON.stringify({
      query: `mutation CreateTrip($trip: TripInput!, $agentCode: String) {
        createTrip(trip: $trip, agentCode: $agentCode) {
          ... on CreateTripSuccessResponse { trip { id name } }
          ... on DuplicateResourceError    { message existingId }
        }
      }`,
      variables: { trip: tripInput, agentCode: AGENT_CODE },
    }),
  })

  const tripJson = await tripRes.json()
  if (!tripRes.ok || tripJson.errors?.length) {
    return NextResponse.json({
      error: tripJson.errors?.[0]?.message ?? 'Failed to create trip',
    }, { status: 502 })
  }

  const result = tripJson.data?.createTrip
  const tripId = result?.trip?.id ?? result?.existingId
  if (!tripId) {
    return NextResponse.json({ error: 'No trip ID returned' }, { status: 502 })
  }

  // Hand the customer's auth_session back to the agent's browser so subsequent
  // story / image / conversation calls (which proxy `Cookie: auth_session=…`
  // through `extractAuthToken`) can load *this* customer's trip view. Without
  // it, the trip detail page hits the same "Resource not found" wall as the
  // agent home page, because HX trip stories are keyed by customer auth_token.
  //
  // Scope: this is a freshly-minted customer with no prior data, so the agent
  // only ever sees what the agent themselves just created. Agent identity is
  // preserved by the heha_session JWT (isAgent:true) — auth_session is purely
  // a downstream-API key for HX, not a UI-level "you are this customer" flag.
  const response = NextResponse.json({
    success: true,
    tripId,
    customerEmail: email.trim().toLowerCase(),
    isNewAccount: true,
  })

  response.cookies.set('auth_session', customerAuthSession, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    // 7 days — matches our app session; refreshed each time the agent creates
    // a trip for that customer, replaced when they create one for a new one.
    maxAge: 60 * 60 * 24 * 7,
  })

  return response
}
