import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent'

const BUCKET = 'trip-images'

// L1: in-memory cache (per container, lost on cold start)
const memCache = new Map<string, { url: string; buf: ArrayBuffer }>()

// Supabase client (server-side, service role)
function supabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

function storageKey(tripId: string) {
  return `${tripId}.png`
}

// ── Reference image loading ───────────────────────────────────────────────────

function loadRefParts(prefix: string, count: number): Array<{ inlineData: { mimeType: string; data: string } }> {
  const results = []
  for (let i = 1; i <= count; i++) {
    try {
      const filePath = path.join(process.cwd(), 'public', 'ref', `${prefix}-${i}.png`)
      const data = readFileSync(filePath)
      results.push({ inlineData: { mimeType: 'image/png', data: data.toString('base64') } })
    } catch {
      // Reference image missing — skip
    }
  }
  return results
}

// ── Image generation ──────────────────────────────────────────────────────────

async function generate(destination: string): Promise<ArrayBuffer> {
  const apiKey = process.env.GEMINI_API_KEY ?? ''
  const birdParts = loadRefParts('bird', 4)
  const exampleParts = loadRefParts('example', 6)

  const prompt = `Generate a cinematic, ultra-detailed travel photograph of ${destination}.

Use the attached rainbow parrot images ONLY as character design reference (color gradient, feather texture, crest shape, sunglasses style).
Do NOT replicate the reference pose, framing, or composition.

The parrot must appear in a completely new, natural, context-aware pose that fits the environment (for example: casually perched on a railing, gripping a suitcase handle, adjusting sunglasses, leaning slightly forward, mid-step on cobblestones, balancing on a ski lift bar, interacting subtly with surroundings).

Avoid symmetrical wings-spread studio poses unless the scene naturally requires flight.
Avoid centered character-sheet composition.
Avoid black or empty backgrounds.
The pose should feel candid, spontaneous, and captured mid-moment like a real travel photograph.

Scale: The parrot must be realistically small (true-to-life parrot size), physically believable within the environment — not oversized, not mascot scale.

Character details: Vibrant rainbow feather gradient (red → orange → yellow → green → blue → purple), dimensional layered feathers with realistic micro-texture and subtle natural sheen. Rainbow crest. Glossy yellow sunglasses with accurate reflections from the surrounding environment. Confident, joyful, adventurous expression.

Style: High-end animated realism (Pixar / DreamWorks-level quality), physically based rendering, ultra-clean global illumination, natural shadow physics, premium travel campaign aesthetic.

Camera: Wide-angle lens (24–35mm), shallow depth of field, creamy cinematic bokeh, sharp focus on the parrot, dynamic perspective, travel editorial composition.

Color grading: High dynamic range, vibrant but natural tones, cinematic contrast, realistic light falloff, no oversaturation.

CRITICAL: The pose must be unique and different from the reference images. Integrate the parrot naturally into the scene as if it truly belongs there.

No text, no logos, no watermarks.`

  const parts: object[] = [
    { text: 'Reference images of the HEHA! parrot mascot character:' },
    ...birdParts,
    { text: 'Examples of the style, quality, and composition we want — the parrot in real travel scenes:' },
    ...exampleParts,
    { text: prompt },
  ]

  const body = {
    contents: [{ parts }],
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
  }

  const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`)

  const json = await res.json()
  const responseParts: Array<{ inlineData?: { data: string } }> = json.candidates?.[0]?.content?.parts ?? []

  for (const part of responseParts) {
    if (part.inlineData?.data) {
      const buf = Buffer.from(part.inlineData.data, 'base64')
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    }
  }

  throw new Error('No image in Gemini response')
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function getSupabasePublicUrl(tripId: string): Promise<string | null> {
  const sb = supabase()
  if (!sb) return null
  const key = storageKey(tripId)
  // Check if the object exists
  const { data, error } = await sb.storage.from(BUCKET).list('', { search: key })
  const file = data?.find(f => f.name === key)
  if (error || !file) return null
  const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(key)
  if (!urlData.publicUrl) return null
  // Append updated_at as a version param so CDN cache busts after regeneration
  const version = file.updated_at ? new Date(file.updated_at).getTime() : ''
  return version ? `${urlData.publicUrl}?v=${version}` : urlData.publicUrl
}

async function uploadToSupabase(tripId: string, buf: ArrayBuffer): Promise<string | null> {
  const sb = supabase()
  if (!sb) return null
  const { error } = await sb.storage.from(BUCKET).upload(storageKey(tripId), buf, {
    contentType: 'image/png',
    upsert: true,
    cacheControl: '31536000', // 1 year
  })
  if (error) {
    console.error('Supabase upload failed:', error.message)
    return null
  }
  const { data } = sb.storage.from(BUCKET).getPublicUrl(storageKey(tripId))
  return data.publicUrl ?? null
}

async function deleteFromSupabase(tripId: string): Promise<void> {
  const sb = supabase()
  if (!sb) return
  await sb.storage.from(BUCKET).remove([storageKey(tripId)])
}

// ── Route handlers ────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await context.params

  // L1: in-memory
  const cached = memCache.get(tripId)
  if (cached) {
    return new Response(cached.buf, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' },
    })
  }

  // L2: Supabase Storage
  const publicUrl = await getSupabasePublicUrl(tripId)
  if (publicUrl) {
    // Warm the in-memory cache asynchronously (fire-and-forget)
    fetch(publicUrl).then(r => r.ok ? r.arrayBuffer() : null).then(buf => {
      if (buf) memCache.set(tripId, { url: publicUrl, buf })
    }).catch(() => {})
    return NextResponse.redirect(publicUrl, { status: 302 })
  }

  // L3: Generate — needs destination
  const destination = req.nextUrl.searchParams.get('destination')
  if (!destination) {
    return new Response(null, { status: 404 })
  }

  try {
    const buf = await generate(destination)
    // Upload to Supabase (non-blocking for response speed)
    uploadToSupabase(tripId, buf).then(url => {
      memCache.set(tripId, { url: url ?? '', buf })
    }).catch(() => {
      memCache.set(tripId, { url: '', buf })
    })
    return new Response(buf, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' },
    })
  } catch (e) {
    console.error('Trip image generation failed:', e)
    return new Response(null, { status: 502 })
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await context.params
  const body = await req.json().catch(() => ({}))
  const destination = body.destination ?? tripId

  // Bust both caches
  memCache.delete(tripId)
  await deleteFromSupabase(tripId)

  try {
    const buf = await generate(destination)
    // Await upload so the new image is in Supabase before we respond —
    // prevents a fast refresh from finding a deleted file and triggering yet another generation
    const url = await uploadToSupabase(tripId, buf).catch(() => null)
    memCache.set(tripId, { url: url ?? '', buf })
    return new Response(buf, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' },
    })
  } catch (e) {
    console.error('Trip image regeneration failed:', e)
    return new Response(null, { status: 502 })
  }
}
