import { NextRequest } from 'next/server'
import { extractAuthToken } from '@/lib/auth/extract-token'

const HX_BASE = 'https://apigw.holidayextras.com/chat-assistant-gateway/llm-platform/v0beta2'
const API_KEY = process.env.HX_GATEWAY_API_KEY ?? ''

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const authToken = extractAuthToken(req)

  const headers: Record<string, string> = {
    'x-apikey': API_KEY,
    'Content-Type': 'application/json',
    Accept: 'text/stream',
  }
  if (authToken) headers['Cookie'] = `auth_token=${authToken}`

  const upstream = await fetch(`${HX_BASE}/conversations/${id}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!upstream.ok || !upstream.body) {
    return new Response('Upstream error', { status: upstream.status })
  }

  // Strip T-marker timing bytes (T + 3 digits) and stream plain text to client.
  // The iOS app uses a 4-byte sliding window; we do the same with a TransformStream.
  const stripped = upstream.body.pipeThrough(timingMarkerStripper())

  return new Response(stripped, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}

// Removes T000–T999 timing markers from the HX stream using a 4-byte lookahead buffer.
function timingMarkerStripper(): TransformStream<Uint8Array, Uint8Array> {
  const lookahead: number[] = []
  const output: number[] = []
  const digits = new Set('0123456789'.split('').map(c => c.charCodeAt(0)))

  return new TransformStream({
    transform(chunk, controller) {
      for (const byte of chunk) {
        lookahead.push(byte)
        if (lookahead.length < 4) continue

        // Check if the 4-byte window is a timing marker: T + 3 decimal digits
        if (
          lookahead[0] === 0x54 && // 'T'
          digits.has(lookahead[1]) &&
          digits.has(lookahead[2]) &&
          digits.has(lookahead[3])
        ) {
          // It's a marker — flush output, discard marker
          if (output.length > 0) {
            controller.enqueue(new Uint8Array(output.splice(0)))
          }
          lookahead.splice(0)
        } else {
          output.push(lookahead.shift()!)
          // Flush on word/line boundaries for responsiveness
          if (output[output.length - 1] === 0x20 || output[output.length - 1] === 0x0a) {
            controller.enqueue(new Uint8Array(output.splice(0)))
          }
        }
      }
    },
    flush(controller) {
      // Drain remaining bytes (< 4, so not a complete marker)
      for (const byte of lookahead) output.push(byte)
      if (output.length > 0) controller.enqueue(new Uint8Array(output))
    },
  })
}

