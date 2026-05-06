import { NextRequest, NextResponse } from 'next/server'
import { extractAuthToken } from '@/lib/auth/extract-token'

const HX_BASE = 'https://apigw.holidayextras.com/chat-assistant-gateway/llm-platform/v0beta2'
const API_KEY = process.env.HX_GATEWAY_API_KEY ?? ''

export async function GET(req: NextRequest) {
  const incoming = req.nextUrl.searchParams
  const url = new URL(`${HX_BASE}/stories`)
  incoming.forEach((value, key) => url.searchParams.set(key, value))

  const headers: Record<string, string> = {
    'x-apikey': API_KEY,
    Accept: 'application/json',
  }

  const authToken = extractAuthToken(req)
  if (authToken) headers['Cookie'] = `auth_token=${authToken}`

  const res = await fetch(url.toString(), { headers })
  const data = await res.json()
  const response = NextResponse.json(data, { status: res.status })
  if (res.ok) {
    response.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120')
  }
  return response
}
