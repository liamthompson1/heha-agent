'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronLeft, faUser, faArrowUp, faHouse, faPlaneDeparture, faXmark, faPlus } from '@fortawesome/free-solid-svg-icons'
import { usePathname } from 'next/navigation'
import { StoriesResponse, ChatMessage, ParsedSection } from '@/lib/types'
import { parseMarkdownSections, resolveTemplate, extractNavPaths } from '@/lib/parseMarkdown'
import { nanoid } from '@/lib/nanoid'
import { useSession } from '@/lib/auth/use-session'
import { useStorySocket } from '@/lib/useStorySocket'
import * as Orion from '@/lib/orion'
import SectionCard from './SectionCard'
import ChatBubble, { PulsingDot } from './ChatBubble'
import AccountSheet from './AccountSheet'
import TripHero from './TripHero'
import TripActionsMenu from './TripActionsMenu'
import NewTripWizard from './NewTripWizard'
import { basePath } from '@/lib/basePath'

interface CachedStory {
  story: StoriesResponse
  sections: ParsedSection[]
  params: Record<string, string>
  loadedAt: number
}

async function prefetchLinked(
  data: StoriesResponse,
  merged: Record<string, string>,
  baseParams: Record<string, string>,
  cache: Map<string, CachedStory>,
) {
  const paths = new Set<string>()
  const resolve = (p: string) => resolveTemplate(p, merged).split('?')[0]
  for (const p of Object.values(data.childResources ?? {})) paths.add(resolve(p))
  for (const p of Object.values(data.parentResources ?? {})) paths.add(resolve(p))
  for (const p of extractNavPaths(data.text ?? '')) paths.add(resolve(p))

  await Promise.allSettled(Array.from(paths).filter(p => p && !cache.has(p)).map(async path => {
    const qs = new URLSearchParams({ resourcePath: path, format: 'markdown', locale: 'en-GB' })
    Object.entries(baseParams).forEach(([k, v]) => { if (v !== '') qs.set(k, v) })
    const res = await fetch(`${basePath}/api/stories?${qs}`)
    if (!res.ok) return
    const story: StoriesResponse = await res.json()
    if (story.text?.includes('Resource not found')) return
    const sections = parseMarkdownSections(story.text)
    cache.set(path, { story, sections, params: { ...baseParams, ...(story.variables ?? {}) }, loadedAt: Date.now() })
  }))
}

function pathFromUrl(url = typeof window !== 'undefined' ? window.location.pathname : '/') {
  const stripped = basePath ? url.replace(new RegExp('^' + basePath), '') : url
  const p = stripped.replace(/^\//, '')
  return p || 'home-app'
}

function preloadSectionImages(sections: import('@/lib/types').ParsedSection[]) {
  sections.slice(0, 6).forEach(s => {
    s.images.forEach(img => {
      const el = new window.Image()
      el.src = img.src
    })
  })
}

export default function StoryScreen() {
  // usePathname() gives the SSR-safe initial path. After mount we manage
  // routing ourselves via pushState/popstate — no router.push() means no
  // Next.js transition machinery, no Suspense flashes.
  const initialPathname = usePathname()
  const session = useSession()

  const [resourcePath, setResourcePath] = useState(
    () => initialPathname === '/' ? 'home-app' : initialPathname.replace(/^\//, '')
  )
  const [params, setParams] = useState<Record<string, string>>({})
  const [story, setStory] = useState<StoriesResponse | null>(null)
  const [sections, setSections] = useState<ParsedSection[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pushCount, setPushCount] = useState(0)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [inputText, setInputText] = useState('')
  const [showAccount, setShowAccount] = useState(false)
  const [showNewTrip, setShowNewTrip] = useState(false)
  const [heroScrolled, setHeroScrolled] = useState(false)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [showMagicToast, setShowMagicToast] = useState(false)
  const [toastExiting, setToastExiting] = useState(false)
  const scrollDepthRef = useRef<Set<number>>(new Set())

  const cache = useRef(new Map<string, CachedStory>())
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<Array<{ path: string; params: Record<string, string> }>>([])
  const socketRefreshRef = useRef<() => void>(() => {})
  // Prevents the popstate listener from double-handling goBack()
  const goBackHandledRef = useRef(false)
  const magicTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const magicExitRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hasAssistant = Boolean(story?.modelId)

  // ── Initial load + re-load on auth change ──────────────────────────────────
  useEffect(() => {
    if (session.loading) return
    Orion.identify(session.userHash ?? null)
    Orion.trackPageLoad(resourcePath, session.authenticated)
    const urlParams = {
      ...Object.fromEntries(new URLSearchParams(window.location.search)),
      ...(session.userHash ? { userHash: session.userHash } : {}),
    }
    // Canonicalise root URL: /trip-planner → /trip-planner/home-app
    const isRoot = window.location.pathname === basePath || window.location.pathname === basePath + '/'
    if (isRoot) window.history.replaceState(null, '', basePath + '/home-app')
    showPath(resourcePath, urlParams)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.authenticated])

  // ── Browser back/forward ──────────────────────────────────────────────────
  useEffect(() => {
    const onPop = () => {
      if (goBackHandledRef.current) { goBackHandledRef.current = false; return }
      const newPath = pathFromUrl()
      const urlParams = Object.fromEntries(new URLSearchParams(window.location.search))
      resetChat()
      setResourcePath(newPath)
      showPath(newPath, urlParams)
      scrollRef.current?.scrollTo({ top: 0 })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Socket: update content in-place without loading flash ────────────────
  socketRefreshRef.current = async () => {
    cache.current.delete(resourcePath)
    // Fetch silently into cache, then swap state without showing a spinner
    await loadStory(resourcePath, params, true)
    const cached = cache.current.get(resourcePath)
    if (cached) {
      setStory(cached.story)
      setSections(cached.sections)
      setParams(cached.params)
      Orion.trackAutoCapture('story_auto_refreshed', resourcePath)
    }
  }
  useStorySocket(resourcePath, session.hxToken, () => socketRefreshRef.current())

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, isStreaming])

  // ── Conversation persistence ──────────────────────────────────────────────
  const CONV_TTL = 30 * 24 * 60 * 60 * 1000

  useEffect(() => {
    if (!session.userHash || messages.length === 0) return
    try {
      localStorage.setItem(`heha_conv_${session.userHash}_${resourcePath}`, JSON.stringify({
        messages,
        conversationId,
        savedAt: Date.now(),
      }))
    } catch {}
  }, [messages, conversationId, resourcePath, session.userHash])

  useEffect(() => {
    if (!session.userHash) return
    try {
      const raw = localStorage.getItem(`heha_conv_${session.userHash}_${resourcePath}`)
      if (!raw) return
      const data = JSON.parse(raw)
      if (Date.now() - data.savedAt > CONV_TTL) {
        localStorage.removeItem(`heha_conv_${session.userHash}_${resourcePath}`)
        return
      }
      setMessages(data.messages ?? [])
      setConversationId(data.conversationId ?? null)
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourcePath, session.userHash])

  // ── Helpers ───────────────────────────────────────────────────────────────

  function startMagicToast() {
    if (magicExitRef.current) { clearTimeout(magicExitRef.current); magicExitRef.current = null }
    setToastExiting(false)
    setShowMagicToast(true)
    if (magicTimerRef.current) clearTimeout(magicTimerRef.current)
    magicTimerRef.current = setTimeout(() => {
      setToastExiting(true)
      magicExitRef.current = setTimeout(() => setShowMagicToast(false), 300)
    }, 3000)
  }

  function resetChat() {
    setMessages([])
    setConversationId(null)
    setIsStreaming(false)
    abortRef.current?.abort()
  }

  // Apply a path from cache immediately, or fetch if missing.
  function showPath(path: string, urlParams: Record<string, string>) {
    scrollDepthRef.current = new Set()
    const cached = cache.current.get(path)
    if (cached) {
      setStory(cached.story)
      setSections(cached.sections)
      setParams(cached.params)
      setIsLoading(false)
      setError(null)
      if (Date.now() - cached.loadedAt > 60_000) loadStory(path, cached.params, true)
    } else {
      setStory(null)
      setSections([])
      setIsLoading(true)
      setError(null)
      loadStory(path, urlParams)
    }
  }

  async function loadStory(
    path: string,
    p: Record<string, string>,
    silent = false,
    scroll = true,
    noCache = false,
  ) {
    if (!silent) { setIsLoading(true); setError(null) }

    try {
      const qs = new URLSearchParams({ resourcePath: path, format: 'markdown', locale: 'en-GB' })
      Object.entries(p).forEach(([k, v]) => { if (v !== '') qs.set(k, v) })
      const res = await fetch(`${basePath}/api/stories?${qs}`, noCache ? { cache: 'no-store' } : undefined)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: StoriesResponse = await res.json()

      if (data.text?.includes('Resource not found')) {
        if (!silent) { setError('not_found'); setIsLoading(false) }
        return
      }

      const merged = { ...p, ...(data.variables ?? {}) }
      const parsed = parseMarkdownSections(data.text)
      cache.current.set(path, { story: data, sections: parsed, params: merged, loadedAt: Date.now() })

      if (silent) { prefetchLinked(data, merged, p, cache.current); return }

      setParams(merged)
      setStory(data)
      setSections(parsed)
      setIsLoading(false)
      setError(null)
      if (scroll) scrollRef.current?.scrollTo({ top: 0 })
      Orion.trackAutoCapture('story_loaded', 'true')

      preloadSectionImages(parsed)
      prefetchLinked(data, merged, p, cache.current)

      const prefill = merged.prefill
      if (prefill && data.modelId) {
        setParams(prev => { const n = { ...prev }; delete n.prefill; return n })
        sendMessage(prefill, data, merged)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load'
      if (!silent) { setError(msg); setIsLoading(false) }
      Orion.trackError(msg, 'story_load_failed', { source: 'server', customerFacing: !silent })
      if (silent) Orion.trackAutoCapture('story_silent_load_failed', path)
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  const isHome = resourcePath === 'home-app'

  // Detect trip detail: trips/{tripId}/... or trips-app/{tripId}/...
  const tripDetailMatch = resourcePath.match(/^trips(?:-app)?\/([^/{][^/]*)/)
  const tripId = tripDetailMatch?.[1] ?? null
  const isTripDetail = tripId !== null

  const hasHero = isHome || isTripDetail
  const showGlass = !hasHero || heroScrolled

  function computeTab(path: string): AppTab {
    if (path === 'trips-app' || path.startsWith('trips-app/') || path === 'trips' || path.startsWith('trips/')) return 'trips'
    return 'home'
  }

  const activeTab = computeTab(resourcePath)

  function navToTab(tabPath: string) {
    if (resourcePath === tabPath) {
      scrollRef.current?.scrollTo({ top: 0 })
      return
    }
    historyRef.current = []
    resetChat()
    setPushCount(0)
    const cached = cache.current.get(tabPath)
    if (cached) {
      setStory(cached.story); setSections(cached.sections); setParams(cached.params)
      setError(null); setIsLoading(false)
    } else {
      setStory(null); setSections([]); setError(null); setIsLoading(true)
      loadStory(tabPath, {})
    }
    setResourcePath(tabPath)
    window.history.pushState(null, '', basePath + '/' + tabPath)
    scrollRef.current?.scrollTo({ top: 0 })
    Orion.trackPageLoad(tabPath, session.authenticated)
  }

  const navigateTo = useCallback((path: string) => {
    const resolved = resolveTemplate(path, params)
    const [cleanPath, query] = resolved.split('?')

    historyRef.current.push({ path: resourcePath, params })
    resetChat()

    const cached = cache.current.get(cleanPath)
    if (cached) {
      setStory(cached.story)
      setSections(cached.sections)
      setParams(cached.params)
      setError(null)
      setIsLoading(false)
    } else {
      setStory(null)
      setSections([])
      setError(null)
      setIsLoading(true)
      loadStory(cleanPath, params)
    }

    setResourcePath(cleanPath)
    window.history.pushState(null, '', basePath + '/' + cleanPath + (query ? '?' + query : ''))
    setPushCount(c => c + 1)
    scrollRef.current?.scrollTo({ top: 0 })
    Orion.trackPageLoad(cleanPath, session.authenticated)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, resourcePath])

  function goBack() {
    const prev = historyRef.current.pop()
    resetChat()
    setPushCount(c => Math.max(0, c - 1))

    if (prev) {
      const cached = cache.current.get(prev.path)
      if (cached) {
        setStory(cached.story)
        setSections(cached.sections)
        setParams(cached.params)
        setError(null)
        setIsLoading(false)
        setResourcePath(prev.path)
        goBackHandledRef.current = true
      }
    }

    window.history.back()
    scrollRef.current?.scrollTo({ top: 0 })
  }

  const prefetchPath = useCallback((rawLink: string) => {
    if (!rawLink) return
    if (rawLink.startsWith('http://') || rawLink.startsWith('https://')) return
    if (rawLink.startsWith('nav://prompt') || rawLink.startsWith('#prompt')) return
    let path = rawLink
    if (path.startsWith('nav://')) path = path.slice('nav://'.length)
    else if (path.startsWith('#nav/')) path = path.slice('#nav/'.length)
    else if (path.startsWith('#') || path.startsWith('?')) return
    const [cleanPath] = resolveTemplate(path, params).split('?')
    if (!cleanPath || cache.current.has(cleanPath)) return
    const qs = new URLSearchParams({ resourcePath: cleanPath, format: 'markdown', locale: 'en-GB' })
    Object.entries(params).forEach(([k, v]) => qs.set(k, v))
    fetch(`${basePath}/api/stories?${qs}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || data.text?.includes('Resource not found')) return
        const sections = parseMarkdownSections(data.text)
        cache.current.set(cleanPath, { story: data, sections, params: { ...params, ...(data.variables ?? {}) }, loadedAt: Date.now() })
        preloadSectionImages(sections)
      })
      .catch(() => {})
  }, [params])

  function onOpenURL(url: string) {
    if (/\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i.test(url)) {
      Orion.trackClick('video_opened', url)
      setVideoUrl(url)
    } else {
      Orion.trackClick('external_link_opened', url)
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  // ── Chat ──────────────────────────────────────────────────────────────────

  async function sendMessage(text: string, storyOverride?: StoriesResponse, paramsOverride?: Record<string, string>) {
    const trimmed = text.trim()
    if (!trimmed) return
    const activeStory = storyOverride ?? story
    const activeParams = paramsOverride ?? params
    if (!activeStory?.modelId) return

    setInputText('')
    setMessages(prev => [...prev, { id: nanoid(), role: 'user', text: trimmed }])
    setIsStreaming(true)
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const assistantId = nanoid()

    try {
      let convId = conversationId
      const userHash = (session.userHash ?? 'anon').slice(0, 8)

      if (!convId) {
        const convRes = await fetch(`${basePath}/api/conversations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelId: activeStory.modelId, userHash, variables: activeParams }),
          signal: ctrl.signal,
        })
        if (!convRes.ok) throw new Error('Failed to start conversation')
        const convData = await convRes.json()
        if (!convData.conversationId) throw new Error('No conversation ID returned')
        convId = convData.conversationId
        setConversationId(convId)
        Orion.trackAutoCapture('conversation_created', convId ?? undefined)
      }

      const userMsgCount = messages.filter(m => m.role === 'user').length + 1
      Orion.trackClick('ai_chat_send_message', `${convId}:${userMsgCount}`)

      setMessages(prev => [...prev, { id: assistantId, role: 'assistant', text: '' }])

      const msgRes = await fetch(`${basePath}/api/conversations/${convId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userHash, messages: [{ text: trimmed }], variables: activeParams }),
        signal: ctrl.signal,
      })
      if (!msgRes.ok || !msgRes.body) throw new Error('Stream error')

      const reader = msgRes.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, text: m.text + decoder.decode(value, { stream: true }) } : m))
      }

      Orion.trackAutoCapture('ai_chat_message_sent', `${convId}:${userMsgCount}`)

    } catch (e) {
      if ((e as Error)?.name === 'AbortError') {
        setMessages(prev => prev.filter(m => m.id !== assistantId))
        return
      }
      setMessages(prev => {
        const has = prev.some(m => m.id === assistantId)
        return has
          ? prev.map(m => m.id === assistantId ? { ...m, text: 'Sorry, something went wrong.' } : m)
          : [...prev, { id: nanoid(), role: 'assistant', text: 'Sorry, something went wrong.' }]
      })
      Orion.trackError('Chat send failed', 'chat_send_failed', { source: 'server', customerFacing: true })
    } finally {
      setIsStreaming(false)
    }
  }

  function handleSubmit(e: React.FormEvent) { e.preventDefault(); sendMessage(inputText) }

  const chatBarVisible = hasAssistant && !!story && !error
  const returnTo = '/' + resourcePath
  const CHAT_H = 56

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: 'var(--bg)' }}>
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-y-auto"
        style={{ overscrollBehaviorY: 'contain', paddingTop: hasHero ? '0' : 'calc(60px + env(safe-area-inset-top, 0px))', paddingBottom: `calc(${chatBarVisible ? CHAT_H + 16 : 16}px + env(safe-area-inset-bottom, 0px))` }}
        onScroll={() => {
          const el = scrollRef.current
          if (!el) return
          if (hasHero) setHeroScrolled(el.scrollTop > 280)
          const pct = Math.round((el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100)
          for (const milestone of [25, 50, 75, 100]) {
            if (pct >= milestone && !scrollDepthRef.current.has(milestone)) {
              scrollDepthRef.current.add(milestone)
              Orion.trackAutoCapture('scroll_depth', `${milestone}`)
            }
          }
        }}
      >
        {/* Full-bleed heroes — outside max-w container so they reach screen edges */}
        {isHome && <HomeHero />}
        {isTripDetail && tripId && <TripHero tripId={tripId} params={params} />}

        <div className="max-w-3xl mx-auto w-full">
          {/* Not signed in — show the existing sign-in CTA. */}
          {!session.loading && !session.authenticated && (
            <LoginPrompt returnTo={returnTo} />
          )}

          {/* Signed-in agent landing on a story HX has no content for (e.g. home-app
              for an agent — the home story is keyed by customer auth_token which agents
              don't have). Show an agent-shaped empty state instead of the misleading
              "Sign In" prompt. */}
          {session.authenticated && error === 'not_found' && (
            <AgentEmptyState
              initials={session.initials}
              agentCode={session.agentCode}
              onStart={() => setShowNewTrip(true)}
            />
          )}

          {error && error !== 'not_found' && (
            <div className="px-4 pt-8 text-center text-[18px]" style={{ color: 'var(--fg-3)' }}>{error}</div>
          )}

          {!error && sections.length > 0 && (
            <>
              <div className="pt-4" key={resourcePath}>
                {sections.map((section, i) => (
                  <div
                    key={section.id}
                    style={{
                      animation: 'fadeSlideUp 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) both',
                      animationDelay: `${Math.min(i * 60, 420)}ms`,
                    }}
                  >
                    <SectionCard
                      section={section}
                      onNavigate={navigateTo}
                      onPrompt={text => sendMessage(text)}
                      onOpenURL={onOpenURL}
                      onPrefetch={prefetchPath}
                      priority={i < 2}
                    />
                  </div>
                ))}
              </div>

              {messages.length > 0 && (
                <>
                  <hr className="mx-4 my-5" style={{ borderColor: 'var(--separator)' }} />
                  <div className="space-y-3">
                    {messages.map(msg => (
                      <ChatBubble
                        key={msg.id}
                        message={msg}
                        onNavigate={navigateTo}
                        onPrompt={text => sendMessage(text)}
                        onOpenURL={onOpenURL}
                      />
                    ))}
                    {isStreaming && messages[messages.length - 1]?.text === '' && <PulsingDot />}
                  </div>
                </>
              )}

              <div ref={bottomRef} />
            </>
          )}
        </div>
      </div>

      <header
        className="absolute top-0 left-0 right-0 z-20"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          background: showGlass
            ? 'var(--header-bg-blur)'
            : 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 100%)',
          borderBottom: showGlass ? '1px solid var(--bar-border)' : 'none',
          backdropFilter: showGlass ? 'saturate(180%) blur(20px)' : 'none',
          WebkitBackdropFilter: showGlass ? 'saturate(180%) blur(20px)' : 'none',
          transition: 'background 0.3s, border-color 0.3s',
        }}
      >
        <div className="max-w-3xl mx-auto w-full h-[60px] grid grid-cols-3 items-center px-5">
          <div className="flex items-center">
            {pushCount > 0 ? (
              <button
                onClick={goBack}
                className="flex items-center justify-center w-11 h-11 rounded-full transition-opacity hover:opacity-75 active:opacity-50"
                style={{
                  background: 'rgba(0,0,0,0.30)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255,255,255,0.18)',
                }}
                aria-label="Back"
              >
                <FontAwesomeIcon icon={faChevronLeft} style={{ width: 15, height: 15, color: 'white' }} />
              </button>
            ) : (
              <div
                className="flex items-center rounded-full"
                style={{
                  background: 'rgba(0,0,0,0.30)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255,255,255,0.18)',
                }}
              >
                <button
                  onClick={() => navToTab('home-app')}
                  className="flex items-center justify-center px-4 h-11 transition-opacity hover:opacity-75 active:opacity-50"
                  style={{ opacity: activeTab === 'home' ? 1 : 0.45 }}
                  aria-label="Home"
                >
                  <FontAwesomeIcon icon={faHouse} style={{ width: 17, height: 17, color: 'white' }} />
                </button>
                <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.18)', flexShrink: 0 }} />
                <button
                  onClick={() => navToTab('trips-app')}
                  className="flex items-center justify-center px-4 h-11 transition-opacity hover:opacity-75 active:opacity-50"
                  style={{ opacity: activeTab === 'trips' ? 1 : 0.45 }}
                  aria-label="Trips"
                >
                  <FontAwesomeIcon icon={faPlaneDeparture} style={{ width: 17, height: 17, color: 'white' }} />
                </button>
              </div>
            )}
          </div>

          <div className="flex justify-center">
            <Image src="https://hximagecloud.imgix.net/trips/hx-logo.webp" alt="Holiday Extras" width={145} height={22} priority unoptimized className="h-auto w-auto max-h-[22px] max-w-full" />
          </div>

          <div className="flex justify-end">
            {!session.loading && (
              session.authenticated ? (
                <div
                  className="flex items-center rounded-full"
                  style={{
                    background: 'rgba(0,0,0,0.30)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255,255,255,0.18)',
                  }}
                >
                  <button
                    onClick={() => setShowAccount(true)}
                    className="flex items-center justify-center px-4 h-11 transition-opacity hover:opacity-70 active:opacity-50"
                    aria-label="Account"
                  >
                    <FontAwesomeIcon icon={faUser} style={{ width: 17, height: 17, color: 'white' }} />
                  </button>
                  {isTripDetail && tripId && (
                    <>
                      <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.18)', flexShrink: 0 }} />
                      <TripActionsMenu
                        tripId={tripId}
                        params={params}
                        onNavigate={navigateTo}
                        iconColor="white"
                        buttonClassName="flex items-center justify-center px-4 h-11"
                      />
                    </>
                  )}
                </div>
              ) : (
                <Link
                  href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
                  className="flex items-center justify-center w-11 h-11 rounded-full transition-opacity hover:opacity-75 active:opacity-50"
                  style={{
                    background: 'rgba(0,0,0,0.30)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255,255,255,0.18)',
                  }}
                  aria-label="Sign in"
                >
                  <FontAwesomeIcon icon={faUser} style={{ width: 18, height: 18, color: 'white' }} />
                </Link>
              )
            )}
          </div>
        </div>
      </header>

      {chatBarVisible && (
        <form
          onSubmit={handleSubmit}
          className="absolute left-0 right-0 z-20 px-4"
          style={{ bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}
        >
          <div
            className="glass-bar max-w-3xl mx-auto flex items-center gap-2 px-3 py-2"
            style={{ borderRadius: '999px', border: '1px solid var(--bar-border)' }}
          >
            <input
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder="Ask about this..."
              disabled={isStreaming}
              className="flex-1 px-3 py-2 text-[18px] outline-none bg-transparent disabled:opacity-50"
              style={{ color: 'var(--fg)' }}
            />
            <button
              type="submit"
              disabled={isStreaming || !inputText.trim()}
              className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center transition-opacity disabled:opacity-30 hover:opacity-75"
              style={{ background: 'var(--btn-primary)' }}
            >
              <FontAwesomeIcon icon={faArrowUp} style={{ width: 15, height: 15, color: '#fff' }} />
            </button>
          </div>
        </form>
      )}

      {/* + New Trip FAB — home and trips root only */}
      {session.authenticated && pushCount === 0 && (
        <button
          onClick={() => setShowNewTrip(true)}
          className="fixed z-30 flex items-center gap-2 rounded-full px-4 h-11 font-semibold text-[15px] shadow-lg transition-opacity hover:opacity-90 active:opacity-70"
          style={{
            right: '20px',
            bottom: `calc(24px + env(safe-area-inset-bottom, 0px))`,
            background: 'var(--btn-primary)',
            color: '#fff',
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          }}
        >
          <FontAwesomeIcon icon={faPlus} style={{ width: 13, height: 13 }} />
          <span>New Trip</span>
        </button>
      )}

      {showAccount && (
        <AccountSheet
          onClose={() => setShowAccount(false)}
          onNavigate={path => { setShowAccount(false); navigateTo(path) }}
          onSignOut={async () => {
            await fetch(`${basePath}/api/auth/logout`, { method: 'POST' })
            Orion.identify(null)
            setShowAccount(false)
            session.refresh()
          }}
        />
      )}

      {videoUrl && <VideoModal url={videoUrl} onClose={() => setVideoUrl(null)} />}

      {/* "Working its magic" toast — shown after trip creation while AI populates content */}
      {showMagicToast && (
        <div
          className="fixed z-40 left-0 right-0 flex justify-center pointer-events-none"
          style={{ bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}
        >
          <div
            className="glass-bar flex items-center gap-2 px-5 py-3 rounded-full"
            style={{
              border: '1px solid var(--bar-border)',
              animation: toastExiting
                ? 'fadeSlideDown 0.3s ease forwards'
                : 'fadeSlideUp 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) both',
            }}
          >
            <span className="text-[15px] font-medium" style={{ color: 'var(--fg)' }}>
              HEHA! is working its magic ✨
            </span>
          </div>
        </div>
      )}

      {showNewTrip && (
        <NewTripWizard
          onClose={() => setShowNewTrip(false)}
          onTripCreated={(tripId) => {
            setShowNewTrip(false)
            const path = `trips-app/${tripId}`
            navigateTo(path)
            startMagicToast()
            let baselineText: string | null = null
            let count = 0
            const poll = () => {
              if (count >= 6) return  // max 9s (6 × 1.5s)
              count++
              setTimeout(async () => {
                startMagicToast()
                // Read params before deleting — loadStory needs them for auth/context
                const pollParams = cache.current.get(path)?.params ?? {}
                cache.current.delete(path)
                await loadStory(path, pollParams, true, true, true)  // silent + noCache: bypass 30s browser cache
                const fresh = cache.current.get(path)
                if (fresh) {
                  const text = fresh.story.text ?? ''
                  if (baselineText === null) {
                    baselineText = text
                  } else if (text !== baselineText) {
                    setStory(fresh.story); setSections(fresh.sections); setParams(fresh.params)
                    return  // content changed — stop polling
                  }
                }
                poll()
              }, 1500)
            }
            poll()
          }}
        />
      )}

    </div>
  )
}

type AppTab = 'home' | 'trips'

function HomeHero() {
  return (
    <div className="relative w-full overflow-hidden" style={{ height: '380px' }}>
      <Image src="https://hximagecloud.imgix.net/trips/home-banner.webp" alt="" fill unoptimized className="object-cover" sizes="100vw" />
      {/* Fade to page background at the bottom for seamless section blending */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to bottom, transparent 50%, var(--bg) 100%)' }}
      />
      <Image src="https://hximagecloud.imgix.net/trips/heha.webp" alt="HEHA!" priority unoptimized width={400} height={200} className="absolute" style={{ bottom: '32px', left: '20px', height: '46px', width: 'auto' }} />
    </div>
  )
}

function VideoModal({ url, onClose }: { url: string; onClose: () => void }) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 flex items-center justify-center w-10 h-10 rounded-full transition-opacity hover:opacity-75 active:opacity-50"
        style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}
        aria-label="Close"
      >
        <FontAwesomeIcon icon={faXmark} style={{ width: 16, height: 16, color: 'white' }} />
      </button>

      {/* Video — stop propagation so clicking the video itself doesn't close */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        src={url}
        autoPlay
        controls
        playsInline
        className="max-w-full max-h-full rounded-2xl"
        style={{ maxWidth: 'min(90vw, 960px)', maxHeight: '80vh', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}
      />
    </div>
  )
}

function LoginPrompt({ returnTo }: { returnTo: string }) {
  return (
    <div className="flex flex-col items-center px-8 pt-20 gap-6 text-center">
      <h2 className="text-[30px] font-semibold tracking-tight" style={{ color: 'var(--fg)' }}>Plan your next adventure</h2>
      <p className="text-[18px] leading-relaxed max-w-xs" style={{ color: '#676767' }}>
        Sign in to access your trips, get personalised recommendations, and chat with your AI travel assistant.
      </p>
      <Link
        href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
        className="w-full max-w-xs rounded-full px-6 py-4 text-[18px] font-normal text-center transition-opacity hover:opacity-80"
        style={{ background: 'var(--btn-primary)', color: '#fff' }}
      >
        Sign In
      </Link>
    </div>
  )
}

function AgentEmptyState({
  initials, agentCode, onStart,
}: {
  initials: string | null
  agentCode: string | null
  onStart: () => void
}) {
  const greeting = initials ? `Welcome, ${initials}` : 'Welcome'
  const sub = agentCode ? `Signed in as agent ${agentCode}` : 'Signed in'
  return (
    <div className="flex flex-col items-center px-8 pt-20 gap-6 text-center">
      <h2 className="text-[30px] font-semibold tracking-tight" style={{ color: 'var(--fg)' }}>{greeting}</h2>
      <p className="text-[15px]" style={{ color: 'var(--fg-3)' }}>{sub}</p>
      <p className="text-[18px] leading-relaxed max-w-sm" style={{ color: '#676767' }}>
        Plan a holiday for your customer. We&rsquo;ll create the trip on their Holiday Extras account using their email address.
      </p>
      <button
        onClick={onStart}
        className="w-full max-w-xs rounded-full px-6 py-4 text-[18px] font-semibold text-center transition-opacity hover:opacity-80"
        style={{ background: 'var(--btn-primary)', color: '#fff' }}
      >
        Plan a trip for a customer
      </button>
    </div>
  )
}
