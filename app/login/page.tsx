'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import * as Orion from '@/lib/orion'
import { basePath } from '@/lib/basePath'

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: 'var(--bg)' }} />}>
      <LoginContent />
    </Suspense>
  )
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('returnTo') ?? '/'

  const [abtaNum, setAbtaNum] = useState('')
  const [password, setPassword] = useState('')
  const [initials, setInitials] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)

  function triggerShake() {
    setShake(true)
    setTimeout(() => setShake(false), 500)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!abtaNum.trim() || !password || !initials.trim()) return
    setError(null)
    setLoading(true)
    Orion.trackClick('agent_login_submit', 'agent_login')
    try {
      const res = await fetch(`${basePath}/api/agent/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ abtaNum: abtaNum.trim(), password, initials: initials.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        const msg = data.error ?? 'Login failed'
        setError(msg)
        triggerShake()
        Orion.trackError(msg, 'agent_login_failed', { source: res.ok ? 'client' : 'server', customerFacing: true })
        return
      }
      Orion.trackAutoCapture('agent_login_success', `${data.agentCode}:${data.initials}`)
      router.push(returnTo)
      router.refresh()
    } catch {
      setError('Network error, please try again')
      triggerShake()
      Orion.trackError('Network error', 'agent_login_failed', { source: 'client', customerFacing: true })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: 'var(--bg)' }}
    >
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image
            src="https://hximagecloud.imgix.net/trips/heha.webp"
            alt="HEHA"
            width={160}
            height={50}
            unoptimized
            className="h-auto w-auto max-h-[50px]"
            priority
          />
        </div>

        <form
          onSubmit={handleSubmit}
          className={`space-y-4 ${shake ? 'animate-shake' : ''}`}
          style={shake ? { animation: 'shake 0.45s ease' } : undefined}
        >
          <div className="text-center mb-8">
            <h1 className="text-[28px] font-semibold tracking-tight" style={{ color: 'var(--fg)' }}>Agent sign in</h1>
            <p className="mt-2 text-[18px]" style={{ color: 'var(--fg-3)' }}>Sign in with your Holiday Extras agent credentials</p>
          </div>

          <input
            type="text"
            autoComplete="username"
            autoFocus
            value={abtaNum}
            onChange={e => setAbtaNum(e.target.value)}
            placeholder="ABTA number"
            required
            className="w-full rounded-2xl px-4 py-4 outline-none text-[18px] transition-colors"
            style={{ background: 'var(--input-bg)', color: 'var(--fg)' }}
          />

          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="w-full rounded-2xl px-4 py-4 outline-none text-[18px] transition-colors"
            style={{ background: 'var(--input-bg)', color: 'var(--fg)' }}
          />

          <input
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={4}
            value={initials}
            onChange={e => setInitials(e.target.value.toUpperCase())}
            placeholder="Initials"
            required
            className="w-full rounded-2xl px-4 py-4 outline-none text-[18px] transition-colors uppercase tracking-widest"
            style={{ background: 'var(--input-bg)', color: 'var(--fg)' }}
          />

          {error && <p className="text-red-400 text-[17px]">{error}</p>}

          <button
            type="submit"
            disabled={loading || !abtaNum.trim() || !password || !initials.trim()}
            className="w-full rounded-full py-4 text-[18px] font-semibold transition-opacity disabled:opacity-40"
            style={{ background: 'var(--btn-primary)', color: '#fff' }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
