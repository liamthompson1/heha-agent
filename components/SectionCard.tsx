'use client'

import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { ParsedSection } from '@/lib/types'
import { rewriteMarkdownLinks } from '@/lib/parseMarkdown'
import * as Orion from '@/lib/orion'

interface Props {
  section: ParsedSection
  onNavigate: (path: string) => void
  onPrompt: (text: string) => void
  onOpenURL: (url: string) => void
  onPrefetch?: (path: string) => void
  priority?: boolean
}

export default function SectionCard({ section, onNavigate, onPrompt, onOpenURL, onPrefetch, priority }: Props) {
  const soleLink = getSoleStructuralLink(section)

  const card = (
    <div className="px-5 py-5 w-full">
      {section.heading && (
        <HeadingLink
          text={section.heading}
          link={section.headingLink}
          size="text-[22px]"
          onNavigate={onNavigate}
          onPrompt={onPrompt}
          onOpenURL={onOpenURL}
          onPrefetch={onPrefetch}
        />
      )}

      <SectionImages images={section.images} onNavigate={onNavigate} onPrompt={onPrompt} onOpenURL={onOpenURL} priority={priority} />

      <div className="prose max-w-none text-[18px] leading-[1.6]" style={{ color: '#676767' }}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          urlTransform={url => url}
          components={{
            img: () => null,
            a({ href, children }) {
              return (
                <LinkHandler href={href} onNavigate={onNavigate} onPrompt={onPrompt} onOpenURL={onOpenURL} onPrefetch={onPrefetch}>
                  {children}
                </LinkHandler>
              )
            },
            h1: ({ children }) => <HeadingBlock level={1}>{children}</HeadingBlock>,
            h2: ({ children }) => <HeadingBlock level={2}>{children}</HeadingBlock>,
            h3: ({ children }) => <HeadingBlock level={3}>{children}</HeadingBlock>,
            h4: ({ children }) => <HeadingBlock level={4}>{children}</HeadingBlock>,
          }}
        >
          {stripImages(rewriteMarkdownLinks(section.content))}
        </ReactMarkdown>
      </div>
    </div>
  )

  return (
    <div
      className="mx-4 mb-3 card"
      onClick={soleLink ? () => {
        Orion.trackClick('story_tapped', section.heading ?? section.headingLink ?? 'card')
        dispatchLink(soleLink, onNavigate, onPrompt, onOpenURL)
      } : undefined}
      onMouseEnter={soleLink && onPrefetch ? () => onPrefetch(soleLink) : undefined}
      style={soleLink ? { cursor: 'pointer' } : undefined}
    >
      {card}
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function SkeletonImg({
  src,
  className,
  style,
  skeletonStyle,
  priority,
}: {
  src: string
  className: string
  style?: React.CSSProperties
  skeletonStyle?: React.CSSProperties
  priority?: boolean
}) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="relative" style={loaded ? undefined : skeletonStyle}>
      {!loaded && <div className="skeleton absolute inset-0 rounded-xl" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className={className}
        style={{ ...style, opacity: loaded ? 1 : 0, transition: 'opacity 0.3s' }}
        loading={priority ? 'eager' : 'lazy'}
        // @ts-expect-error fetchpriority not in React types yet
        fetchpriority={priority ? 'high' : 'auto'}
        decoding="async"
        onLoad={() => setLoaded(true)}
      />
    </div>
  )
}

function SectionImages({
  images,
  onNavigate,
  onPrompt,
  onOpenURL,
  priority,
}: {
  images: ParsedSection['images']
  onNavigate: (path: string) => void
  onPrompt: (text: string) => void
  onOpenURL: (url: string) => void
  priority?: boolean
}) {
  if (images.length === 0) return null

  if (images.length === 1) {
    const img = images[0]
    const el = (
      <SkeletonImg
        src={img.src}
        className="w-full rounded-xl object-cover mb-3"
        style={{ maxHeight: '256px', display: 'block' }}
        skeletonStyle={{ width: '100%', height: '200px', borderRadius: '12px', marginBottom: '12px' }}
        priority={priority}
      />
    )
    if (!img.link) return el
    return (
      <button onClick={e => { e.stopPropagation(); Orion.trackClick('image_tapped', img.link!); dispatchLink(img.link!, onNavigate, onPrompt, onOpenURL) }} className="w-full text-left">
        {el}
      </button>
    )
  }

  return <ImageCarousel images={images} onNavigate={onNavigate} onPrompt={onPrompt} onOpenURL={onOpenURL} priority={priority} />
}

const CAROUSEL_MAX_DOTS = 8

function ImageCarousel({
  images,
  onNavigate,
  onPrompt,
  onOpenURL,
  priority,
}: {
  images: ParsedSection['images']
  onNavigate: (path: string) => void
  onPrompt: (text: string) => void
  onOpenURL: (url: string) => void
  priority?: boolean
}) {
  const [activeDot, setActiveDot] = useState(0)
  const [scrollable, setScrollable] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const numDots = Math.min(images.length, CAROUSEL_MAX_DOTS)

  // Determine if the row actually overflows (needs scrolling).
  // Must re-check after images load — they expand scrollWidth asynchronously.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setScrollable(el.scrollWidth > el.clientWidth + 4)

    // Initial check after layout
    const raf = requestAnimationFrame(measure)

    // Re-check when each image finishes loading
    const imgs = Array.from(el.querySelectorAll('img'))
    imgs.forEach(img => { if (!img.complete) img.addEventListener('load', measure) })

    const ro = new ResizeObserver(measure)
    ro.observe(el)

    return () => {
      cancelAnimationFrame(raf)
      imgs.forEach(img => img.removeEventListener('load', measure))
      ro.disconnect()
    }
  }, [images])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    if (maxScroll <= 0) return
    setActiveDot(Math.round((el.scrollLeft / maxScroll) * (numDots - 1)))
  }

  const goToDot = (dot: number) => {
    const el = scrollRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    el.scrollTo({ left: (dot / (numDots - 1)) * maxScroll, behavior: 'smooth' })
  }

  return (
    <div className="mb-3">
      <div
        ref={scrollRef}
        className="carousel-row flex gap-2 overflow-x-auto"
        style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none' } as React.CSSProperties}
        onScroll={handleScroll}
      >
        {images.map((img, i) => (
          <div key={i} style={{ scrollSnapAlign: 'start', flexShrink: 0 }}>
            {img.link ? (
              <button onClick={e => { e.stopPropagation(); Orion.trackClick('image_tapped', img.link!); dispatchLink(img.link!, onNavigate, onPrompt, onOpenURL) }}>
                <SkeletonImg
                  src={img.src}
                  className="h-40 w-auto rounded-lg"
                  skeletonStyle={{ height: '160px', width: '160px', borderRadius: '8px' }}
                  style={{ display: 'block' }}
                  priority={priority && i === 0}
                />
              </button>
            ) : (
              <SkeletonImg
                src={img.src}
                className="h-40 w-auto rounded-lg"
                skeletonStyle={{ height: '160px', width: '160px', borderRadius: '8px' }}
                style={{ display: 'block' }}
                priority={priority && i === 0}
              />
            )}
          </div>
        ))}
      </div>

      {/* Only show indicator when the row actually scrolls */}
      {scrollable && (
        <div className="flex justify-center items-center gap-[5px] mt-2">
          {Array.from({ length: numDots }, (_, i) => (
            <div
              key={i}
              onClick={e => { e.stopPropagation(); goToDot(i) }}
              style={{
                width: i === activeDot ? 20 : 6,
                height: 6,
                borderRadius: 999,
                background: 'var(--fg)',
                opacity: i === activeDot ? 0.6 : 0.2,
                transition: 'width 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.35s',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function HeadingLink({
  text,
  link,
  size,
  onNavigate,
  onPrompt,
  onOpenURL,
  onPrefetch,
}: {
  text: string
  link?: string
  size: string
  onNavigate: (path: string) => void
  onPrompt: (text: string) => void
  onOpenURL: (url: string) => void
  onPrefetch?: (path: string) => void
}) {
  if (link) {
    return (
      <button
        onClick={e => { e.stopPropagation(); dispatchLink(link, onNavigate, onPrompt, onOpenURL) }}
        onMouseEnter={onPrefetch ? () => onPrefetch(link) : undefined}
        className={`${size} font-semibold tracking-tight mb-2 text-left w-full`}
        style={{ color: 'var(--link)' }}
      >
        {text}
      </button>
    )
  }
  return <p className={`${size} font-semibold tracking-tight mb-2`} style={{ color: 'var(--fg)' }}>{text}</p>
}

function HeadingBlock({ level, children }: { level: number; children: React.ReactNode }) {
  const sizes: Record<number, string> = { 1: 'text-[26px]', 2: 'text-[22px]', 3: 'text-[19px]', 4: 'text-[18px]' }
  const size = sizes[level] ?? 'text-[18px]'
  const weight = level <= 2 ? 'font-semibold' : 'font-normal'
  const color = level <= 2 ? 'var(--fg)' : '#676767'
  return <p className={`${size} ${weight} tracking-tight mt-4 mb-1`} style={{ color }}>{children}</p>
}

function LinkHandler({
  href,
  children,
  onNavigate,
  onPrompt,
  onOpenURL,
  onPrefetch,
}: {
  href?: string
  children: React.ReactNode
  onNavigate: (path: string) => void
  onPrompt: (text: string) => void
  onOpenURL: (url: string) => void
  onPrefetch?: (path: string) => void
}) {
  if (!href || href.startsWith('mailto:')) return <span>{children}</span>

  return (
    <a
      href={href}
      onClick={e => {
        e.preventDefault()
        e.stopPropagation()
        dispatchLink(href, onNavigate, onPrompt, onOpenURL)
      }}
      onMouseEnter={onPrefetch ? () => onPrefetch(href) : undefined}
      className="cursor-pointer"
    >
      {children}
    </a>
  )
}

// ─── Link dispatch ───────────────────────────────────────────────────────────

function dispatchLink(
  link: string,
  onNavigate: (path: string) => void,
  onPrompt: (text: string) => void,
  onOpenURL: (url: string) => void,
) {
  if (link.startsWith('nav://prompt/')) {
    const rest = link.slice('nav://prompt/'.length)
    const [encoded, qs] = rest.split('?')
    if (qs) {
      const p = new URLSearchParams(qs)
      const trackName = p.get('trackName')
      if (trackName) Orion.trackClick(trackName, p.get('trackValue') ?? undefined)
    }
    onPrompt(decodeURIComponent(encoded))
  } else if (link.startsWith('nav://')) {
    onNavigate(link.slice('nav://'.length))
  } else if (link.startsWith('#nav/')) {
    onNavigate(link.slice('#nav/'.length))
  } else if (link.startsWith('#prompt/')) {
    onPrompt(decodeURIComponent(link.slice('#prompt/'.length)))
  } else if (link.startsWith('http://') || link.startsWith('https://')) {
    onOpenURL(link)
  } else if (link && !link.startsWith('#') && !link.startsWith('?') && !link.includes('://')) {
    onNavigate(link.replace(/^\//, ''))
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSoleStructuralLink(section: ParsedSection): string | undefined {
  const links: string[] = []
  if (section.headingLink) links.push(section.headingLink)
  for (const img of section.images) if (img.link) links.push(img.link)
  const unique = [...new Set(links)]
  return unique.length === 1 ? unique[0] : undefined
}

function stripImages(text: string): string {
  let result = text.replace(/\[!\[.*?\]\([^()]*(?:\([^()]*\)[^()]*)*\)\]\([^()]*(?:\([^()]*\)[^()]*)*\)/g, '')
  result = result.replace(/!\[.*?\]\([^()]*(?:\([^()]*\)[^()]*)*\)/g, '')
  return result.replace(/\n{3,}/g, '\n\n').trim()
}
