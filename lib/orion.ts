// Orion analytics via @holidayextras/tracker (v7.0.0-rc.1)
// tracker.js is loaded as a script in layout.tsx → sets window.tracker
// tracker.initialise() loads orion.min.js from CloudFront and queues events until ready.

declare global {
  interface Window {
    tracker: {
      initialise: (config: { env: string; service: string; organisation: string; lb: boolean }) => void
      page: (system: string, payload: Record<string, unknown>) => void
      track: (event: string, payload: Record<string, unknown>) => void
      inline: (event: string, payload: Record<string, unknown>) => void
      error: (payload: Record<string, unknown>) => void
      e: (code: string, message?: string, info?: string, source?: string) => void
      c: (name: string, value?: string) => void
      ids: (callback: (err: unknown, ids: Record<string, string>) => void) => void
    }
  }
}

// ── Page type resolution ─────────────────────────────────────────────────────

function resolvePageInfo(path: string): { type: string; system: string } {
  const p = path.startsWith('/') ? path.slice(1) : path
  if (!p || p === 'home-app') return { type: 'home', system: 'heha' }
  if (p === 'trips-app' || p.startsWith('trips-app/') || p === 'trips' || p.startsWith('trips/')) {
    return p.split('/').length >= 3
      ? { type: 'trip_details', system: 'heha' }
      : { type: 'your_trips', system: 'heha' }
  }
  if (p.startsWith('customer/bookings')) return { type: 'view_bookings', system: 'manage_booking' }
  if (p.startsWith('support'))          return { type: 'support', system: 'landing' }
  if (p.startsWith('customer/account')) return { type: 'account', system: 'account' }
  return { type: 'home', system: 'heha' }
}

// ── Accessor — null-safe, SSR-safe ───────────────────────────────────────────

function t() {
  if (typeof window === 'undefined') return null
  return window.tracker ?? null
}

// ── Public API ───────────────────────────────────────────────────────────────

// Called when auth state is determined; stored for customer_state events
let _authenticated: boolean | null = null

export function identify(_userHash: string | null) {
  // User identity is managed via window.orion session context.
  // We track the customer state separately in trackPageLoad.
}

export function trackPageLoad(path: string, authenticated: boolean) {
  _authenticated = authenticated
  const { type, system } = resolvePageInfo(path)
  const cleanPath = path.startsWith('/') ? path : '/' + path
  t()?.page(system, { page_type: type, path: cleanPath })
  t()?.track('customer_state', { customer_state: authenticated ? 'authenticated' : 'unrecognised' })
}

export function trackClick(name: string, value?: string) {
  t()?.inline('click', { name, value: value ?? null })
}

export function trackCapture(name: string, value?: string) {
  t()?.inline('capture', { name, value: value ?? null })
}

export function trackAutoCapture(name: string, value?: string) {
  t()?.c(name, value)
}

export function trackError(
  message: string,
  code: string,
  opts?: { source?: 'client' | 'server'; customerFacing?: boolean }
) {
  const { source = 'client' } = opts ?? {}
  t()?.e(code, message, undefined, source)
}
