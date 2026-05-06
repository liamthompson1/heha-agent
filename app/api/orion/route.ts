import { NextRequest, NextResponse } from 'next/server'

const COLLECTOR = 'https://collector.holidayextras.co.uk/collect'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const type = body?.meta?.event?.type

  const res = await fetch(COLLECTOR, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await res.json().catch(() => null)
  if (!res.ok) console.error('[Orion]', type, res.status, JSON.stringify(data))

  return NextResponse.json(data ?? {}, { status: 200 })
}
