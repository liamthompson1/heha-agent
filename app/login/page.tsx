'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Image from 'next/image'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronLeft } from '@fortawesome/free-solid-svg-icons'
import * as Orion from '@/lib/orion'
import { basePath } from '@/lib/basePath'

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: 'var(--bg)' }} />}>
      <LoginContent />
    </Suspense>
  )
}

const OTP_LENGTH = 6
const RESEND_COOLDOWN = 30

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('returnTo') ?? '/'

  const [step, setStep] = useState<'email' | 'otp' | 'profile'>('email')
  const [email, setEmail] = useState('')
  const [smsSentTo, setSmsSentTo] = useState<string | null>(null)
  const [isNewAccount, setIsNewAccount] = useState(false)
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)
  const [animating, setAnimating] = useState(false)

  const digitRefs = useRef<(HTMLInputElement | null)[]>([])
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startCountdown = useCallback(() => {
    setResendCountdown(RESEND_COOLDOWN)
    if (countdownRef.current) clearInterval(countdownRef.current)
    countdownRef.current = setInterval(() => {
      setResendCountdown(n => {
        if (n <= 1) { clearInterval(countdownRef.current!); return 0 }
        return n - 1
      })
    }, 1000)
  }, [])

  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current) }, [])

  const triggerShake = useCallback(() => {
    setShake(true)
    setTimeout(() => setShake(false), 500)
  }, [])

  const otp = digits.join('')

  async function submitOtp(code: string) {
    if (code.length < OTP_LENGTH || loading) return
    setError(null)
    setLoading(true)
    Orion.trackClick('login_verify', 'verify')
    try {
      const res = await fetch(`${basePath}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: code }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Invalid code')
        triggerShake()
        setDigits(Array(OTP_LENGTH).fill(''))
        setTimeout(() => digitRefs.current[0]?.focus(), 50)
        Orion.trackError(data.error ?? 'Invalid code', 'otp_verify_failed', { source: res.ok ? 'client' : 'server', customerFacing: true })
        return
      }
      Orion.trackAutoCapture('login_success', email)
      if (isNewAccount) {
        setAnimating(true)
        setTimeout(() => {
          setStep('profile')
          setError(null)
          setAnimating(false)
        }, 220)
      } else {
        router.push(returnTo)
        router.refresh()
      }
    } catch {
      setError('Network error, please try again')
      triggerShake()
      Orion.trackError('Network error', 'otp_verify_failed', { source: 'client', customerFacing: true })
    } finally {
      setLoading(false)
    }
  }

  async function requestOtp(targetEmail: string) {
    setError(null)
    setLoading(true)
    Orion.trackClick('login_send_code', 'send_code')
    try {
      const res = await fetch(`${basePath}/api/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Failed to send code')
        Orion.trackError(data.error ?? 'Failed to send code', 'otp_request_failed', { source: res.ok ? 'client' : 'server', customerFacing: true })
        return false
      }
      setSmsSentTo(data.smsSentTo)
      setIsNewAccount(data.isNewAccount ?? false)
      if (data.isNewAccount) Orion.trackAutoCapture('signup_started', targetEmail)
      startCountdown()
      return { isNewAccount: data.isNewAccount ?? false }
    } catch {
      setError('Network error, please try again')
      Orion.trackError('Network error', 'otp_request_failed', { source: 'client', customerFacing: true })
      return false
    } finally {
      setLoading(false)
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    const result = await requestOtp(email)
    if (!result) return
    setAnimating(true)
    setTimeout(() => {
      if (result.isNewAccount) {
        setStep('profile')
        setError(null)
      } else {
        setStep('otp')
        setDigits(Array(OTP_LENGTH).fill(''))
        setTimeout(() => digitRefs.current[0]?.focus(), 50)
      }
      setAnimating(false)
    }, 220)
  }

  async function handleResend() {
    if (resendCountdown > 0 || loading) return
    Orion.trackClick('login_resend_code', email)
    setDigits(Array(OTP_LENGTH).fill(''))
    setError(null)
    await requestOtp(email)
    setTimeout(() => digitRefs.current[0]?.focus(), 50)
  }

  async function handleProfileSubmit(givenName: string, familyName: string, contactNumber: string) {
    const hasData = givenName || familyName || contactNumber
    if (hasData) {
      setLoading(true)
      setError(null)
      Orion.trackClick('signup_profile_submitted', email)
      try {
        await fetch(`${basePath}/api/auth/complete-profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ givenName, familyName, contactNumber }),
        })
      } catch {
        // Non-fatal — profile can be completed later
      } finally {
        setLoading(false)
      }
    }
    router.push(returnTo)
    router.refresh()
  }

  function handleProfileSkip() {
    Orion.trackClick('signup_profile_skipped', email)
    router.push(returnTo)
    router.refresh()
  }

  function goBack() {
    Orion.trackClick('login_change_email', 'use_a_different_email')
    setAnimating(true)
    setTimeout(() => {
      setStep('email')
      setError(null)
      setDigits(Array(OTP_LENGTH).fill(''))
      setAnimating(false)
    }, 220)
  }

  function handleDigitChange(index: number, value: string) {
    // Handle paste
    if (value.length > 1) {
      const pasted = value.replace(/\D/g, '').slice(0, OTP_LENGTH)
      const next = Array(OTP_LENGTH).fill('')
      pasted.split('').forEach((ch, i) => { next[i] = ch })
      setDigits(next)
      const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1)
      digitRefs.current[focusIdx]?.focus()
      if (pasted.length === OTP_LENGTH) submitOtp(pasted)
      return
    }
    const ch = value.replace(/\D/g, '')
    const next = [...digits]
    next[index] = ch
    setDigits(next)
    if (ch && index < OTP_LENGTH - 1) {
      digitRefs.current[index + 1]?.focus()
    }
    const full = next.join('')
    if (full.length === OTP_LENGTH && !next.includes('')) submitOtp(full)
  }

  function handleDigitKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        const next = [...digits]
        next[index] = ''
        setDigits(next)
      } else if (index > 0) {
        digitRefs.current[index - 1]?.focus()
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      digitRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      digitRefs.current[index + 1]?.focus()
    }
  }

  const slideClass = animating
    ? (step === 'email' ? 'translate-x-8 opacity-0' : '-translate-x-8 opacity-0')
    : 'translate-x-0 opacity-100'

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: 'var(--bg)' }}
    >
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image src="https://hximagecloud.imgix.net/trips/heha.webp" alt="HEHA" width={160} height={50} unoptimized className="h-auto w-auto max-h-[50px]" priority />
        </div>

        <div
          className="transition-all duration-200 ease-in-out"
          style={{ transform: animating ? (step === 'email' ? 'translateX(32px)' : 'translateX(-32px)') : 'translateX(0)', opacity: animating ? 0 : 1 }}
        >
          {step === 'email' ? (
            <EmailStep
              email={email}
              setEmail={setEmail}
              loading={loading}
              error={error}
              onSubmit={handleEmailSubmit}
            />
          ) : step === 'otp' ? (
            <OtpStep
              email={email}
              smsSentTo={smsSentTo}
              digits={digits}
              digitRefs={digitRefs}
              loading={loading}
              error={error}
              shake={shake}
              resendCountdown={resendCountdown}
              onDigitChange={handleDigitChange}
              onDigitKeyDown={handleDigitKeyDown}
              onResend={handleResend}
              onBack={goBack}
            />
          ) : (
            <ProfileStep
              loading={loading}
              error={error}
              onSubmit={handleProfileSubmit}
              onSkip={handleProfileSkip}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Email step ───────────────────────────────────────────────────────────────

function EmailStep({
  email, setEmail, loading, error, onSubmit,
}: {
  email: string
  setEmail: (v: string) => void
  loading: boolean
  error: string | null
  onSubmit: (e: React.FormEvent) => void
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="text-center mb-8">
        <h1 className="text-[28px] font-semibold tracking-tight" style={{ color: 'var(--fg)' }}>Welcome</h1>
        <p className="mt-2 text-[18px]" style={{ color: 'var(--fg-3)' }}>Enter your email to sign in or create an account</p>
      </div>

      <input
        type="email"
        autoComplete="email"
        autoFocus
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="Email address"
        required
        className="w-full rounded-2xl px-4 py-4 outline-none text-[18px] transition-colors"
        style={{ background: 'var(--input-bg)', color: 'var(--fg)' }}
      />

      {error && <p className="text-red-400 text-[17px]">{error}</p>}

      <button
        type="submit"
        disabled={loading || !email}
        className="w-full rounded-full py-4 text-[18px] font-semibold transition-opacity disabled:opacity-40"
        style={{ background: 'var(--btn-primary)', color: '#fff' }}
      >
        {loading ? 'Sending…' : 'Continue'}
      </button>
    </form>
  )
}

// ─── OTP step ─────────────────────────────────────────────────────────────────

function OtpStep({
  email, smsSentTo, digits, digitRefs, loading, error, shake,
  resendCountdown, onDigitChange, onDigitKeyDown, onResend, onBack,
}: {
  email: string
  smsSentTo: string | null
  digits: string[]
  digitRefs: React.MutableRefObject<(HTMLInputElement | null)[]>
  loading: boolean
  error: string | null
  shake: boolean
  resendCountdown: number
  onDigitChange: (i: number, v: string) => void
  onDigitKeyDown: (i: number, e: React.KeyboardEvent<HTMLInputElement>) => void
  onResend: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-5">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-[18px] transition-opacity hover:opacity-70 mb-2"
        style={{ color: 'var(--link)' }}
      >
        <FontAwesomeIcon icon={faChevronLeft} style={{ width: 12, height: 12 }} />
        Back
      </button>

      <div className="mb-8">
        <h1 className="text-[28px] font-semibold tracking-tight" style={{ color: 'var(--fg)' }}>Check your email</h1>
        <p className="mt-2 text-[18px]" style={{ color: 'var(--fg-3)' }}>
          {smsSentTo
            ? <>Code sent to <strong style={{ color: 'var(--fg-2)' }}>{email}</strong> and via SMS to …{smsSentTo}</>
            : <>Code sent to <strong style={{ color: 'var(--fg-2)' }}>{email}</strong></>
          }
        </p>
      </div>

      {/* Digit boxes */}
      <div
        className={`flex gap-2 justify-between ${shake ? 'animate-shake' : ''}`}
        style={shake ? { animation: 'shake 0.45s ease' } : undefined}
      >
        {digits.map((d, i) => (
          <input
            key={i}
            ref={el => { digitRefs.current[i] = el }}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={OTP_LENGTH}
            value={d}
            onChange={e => onDigitChange(i, e.target.value)}
            onKeyDown={e => onDigitKeyDown(i, e)}
            onFocus={e => e.target.select()}
            className="flex-1 rounded-2xl text-center text-[24px] font-semibold outline-none transition-all py-4"
            style={{
              background: 'var(--input-bg)',
              color: 'var(--fg)',
              border: '2px solid transparent',
              minWidth: 0,
            }}
            onFocusCapture={e => {
              e.currentTarget.style.borderColor = 'var(--link)'
            }}
            onBlurCapture={e => {
              e.currentTarget.style.borderColor = 'transparent'
            }}
          />
        ))}
      </div>

      {error && <p className="text-red-400 text-[17px]">{error}</p>}

      {/* Loading indicator */}
      {loading && (
        <p className="text-center text-[17px]" style={{ color: 'var(--fg-3)' }}>Verifying…</p>
      )}

      {/* Resend */}
      <div className="text-center pt-2">
        {resendCountdown > 0 ? (
          <p className="text-[17px]" style={{ color: 'var(--fg-3)' }}>
            Resend code in {resendCountdown}s
          </p>
        ) : (
          <button
            onClick={onResend}
            disabled={loading}
            className="text-[17px] transition-opacity hover:opacity-70 disabled:opacity-40"
            style={{ color: 'var(--link)' }}
          >
            Resend code
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Profile step ─────────────────────────────────────────────────────────────

function ProfileStep({
  loading, error, onSubmit, onSkip,
}: {
  loading: boolean
  error: string | null
  onSubmit: (givenName: string, familyName: string, contactNumber: string) => void
  onSkip: () => void
}) {
  const [givenName, setGivenName] = useState('')
  const [familyName, setFamilyName] = useState('')
  const [contactNumber, setContactNumber] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit(givenName, familyName, contactNumber)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-center mb-8">
        <h1 className="text-[28px] font-semibold tracking-tight" style={{ color: 'var(--fg)' }}>One last thing</h1>
        <p className="mt-2 text-[18px]" style={{ color: 'var(--fg-3)' }}>Tell us a bit about yourself</p>
      </div>

      <input
        type="text"
        autoComplete="given-name"
        autoFocus
        value={givenName}
        onChange={e => setGivenName(e.target.value)}
        placeholder="First name"
        className="w-full rounded-2xl px-4 py-4 outline-none text-[18px] transition-colors"
        style={{ background: 'var(--input-bg)', color: 'var(--fg)' }}
      />

      <input
        type="text"
        autoComplete="family-name"
        value={familyName}
        onChange={e => setFamilyName(e.target.value)}
        placeholder="Last name"
        className="w-full rounded-2xl px-4 py-4 outline-none text-[18px] transition-colors"
        style={{ background: 'var(--input-bg)', color: 'var(--fg)' }}
      />

      <input
        type="tel"
        autoComplete="tel"
        value={contactNumber}
        onChange={e => setContactNumber(e.target.value)}
        placeholder="Phone number"
        required
        className="w-full rounded-2xl px-4 py-4 outline-none text-[18px] transition-colors"
        style={{ background: 'var(--input-bg)', color: 'var(--fg)' }}
      />

      {error && <p className="text-red-400 text-[17px]">{error}</p>}

      <button
        type="submit"
        disabled={loading || !contactNumber}
        className="w-full rounded-full py-4 text-[18px] font-semibold transition-opacity disabled:opacity-40 mt-1"
        style={{ background: 'var(--btn-primary)', color: '#fff' }}
      >
        {loading ? 'Saving…' : 'Continue'}
      </button>

      <div className="text-center pt-1">
        <button
          type="button"
          onClick={onSkip}
          disabled={loading}
          className="text-[17px] transition-opacity hover:opacity-70 disabled:opacity-40"
          style={{ color: 'var(--fg-3)' }}
        >
          Skip for now
        </button>
      </div>
    </form>
  )
}
