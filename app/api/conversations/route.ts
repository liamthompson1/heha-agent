import { NextRequest, NextResponse } from 'next/server'
import { extractAuthToken } from '@/lib/auth/extract-token'

const HX_BASE = 'https://apigw.holidayextras.com/chat-assistant-gateway/llm-platform/v0beta2'
const API_KEY = process.env.HX_GATEWAY_API_KEY ?? ''

export async function POST(req: NextRequest) {
  const body = await req.json()
  const authToken = extractAuthToken(req)

  const headers: Record<string, string> = {
    'x-apikey': API_KEY,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (authToken) headers['Cookie'] = `auth_token=${authToken}`

  const res = await fetch(`${HX_BASE}/conversations`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) return NextResponse.json({ error: 'Failed to create conversation' }, { status: res.status })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
