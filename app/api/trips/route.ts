import { NextRequest, NextResponse } from 'next/server'
import { extractAuthToken } from '@/lib/auth/extract-token'

const TRAVELLER_API = 'https://traveller-api.dock-yard.io/graphql'

export async function POST(req: NextRequest) {
  const authToken = extractAuthToken(req)
  if (!authToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { name, fromDate, toDate, outboundFlightReference, inboundFlightReference } = await req.json()

  const tripInput: Record<string, string> = {
    name,
    fromDate: `${fromDate}T00:00:00.000Z`,
    toDate:   `${toDate}T00:00:00.000Z`,
  }
  if (outboundFlightReference) tripInput.outboundFlightReference = outboundFlightReference
  if (inboundFlightReference)  tripInput.inboundFlightReference  = inboundFlightReference

  const res = await fetch(TRAVELLER_API, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${authToken}`,
      'Cookie':        `auth_session=${authToken}`,
    },
    body: JSON.stringify({
      query: `mutation CreateTrip($trip: TripInput!) {
        createTrip(trip: $trip) {
          ... on CreateTripSuccessResponse { trip { id name } }
          ... on DuplicateResourceError { message existingId }
        }
      }`,
      variables: { trip: tripInput },
    }),
  })

  if (!res.ok) return NextResponse.json({ error: 'Failed to create trip' }, { status: res.status })
  return NextResponse.json(await res.json())
}
