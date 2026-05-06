import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const location   = searchParams.get('location') ?? ''
  const departDate = searchParams.get('departDate') ?? ''

  // Only pass destination if explicitly provided — city names return 0 results,
  // so destination filtering is handled client-side.
  const params = new URLSearchParams({ location, departDate, country: '' })

  const res = await fetch(`https://flight.dock-yard.io/search?${params}`, {
    headers: { 'User-Agent': 'heha-web/1.0' },
  })

  if (res.status === 204) return NextResponse.json([])
  if (!res.ok) return NextResponse.json({ error: 'Flight search failed' }, { status: res.status })

  return NextResponse.json(await res.json())
}
