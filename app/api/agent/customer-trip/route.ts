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
    // `createCustomerAccount` rejects when an account already exists — distinguish
    // that from genuine upstream failures so the UI can prompt accordingly.
    const msg = e instanceof Error ? e.message.toLowerCase() : ''
    if (msg.includes('already') || msg.includes('exists') || msg.includes('duplicate')) {
      return NextResponse.json({
        error: 'customer_exists',
        message: 'This email already has a Holiday Extras account. Ask the customer to sign in themselves to add this trip.',
      }, { status: 409 })
    }
    return NextResponse.json({
      error: e instanceof Error ? e.message : 'Failed to create customer account',
    }, { status: 502 })
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

  return NextResponse.json({
    success: true,
    tripId,
    customerEmail: email.trim().toLowerCase(),
    isNewAccount: true,
  })
}
