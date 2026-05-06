'use client'

import { useState, useEffect } from 'react'
import { basePath } from '@/lib/basePath'
import { StoriesResponse, ParsedSection } from '@/lib/types'
import { parseMarkdownSections } from '@/lib/parseMarkdown'
import SectionCard from './SectionCard'

interface Props {
  onClose: () => void
  onNavigate: (path: string) => void
  onSignOut: () => void
}

export default function AccountSheet({ onClose, onNavigate, onSignOut }: Props) {
  const [sections, setSections] = useState<ParsedSection[]>([])

  useEffect(() => {
    fetch(`${basePath}/api/stories?resourcePath=customer/account&format=markdown&locale=en-GB`)
      .then(r => r.ok ? r.json() : null)
      .then((data: StoriesResponse | null) => {
        if (data?.text) setSections(parseMarkdownSections(data.text))
      })
      .catch(() => {})
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30"
        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Sheet — bottom sheet on mobile, centered modal on desktop */}
      <div
        className="fixed z-40 flex flex-col
          bottom-0 left-0 right-0 rounded-t-[20px]
          md:bottom-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2
          md:w-full md:max-w-sm md:rounded-[20px]"
        style={{
          maxHeight: '82dvh',
          background: 'var(--card)',
          border: '1px solid var(--separator)',
        }}
      >
        {/* Mobile: drag indicator — hidden on desktop */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 md:hidden">
          <div className="w-9 h-1 rounded-full" style={{ background: 'var(--fg-3)', opacity: 0.4 }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
          <span className="text-[17px] font-semibold" style={{ color: 'var(--fg)' }}>Account</span>
          <button
            onClick={onClose}
            className="text-[17px] font-normal transition-opacity hover:opacity-60"
            style={{ color: 'var(--link)' }}
          >
            Done
          </button>
        </div>

        {/* Story content */}
        <div className="flex-1 overflow-y-auto" style={{ borderTop: '1px solid var(--separator)' }}>
          {sections.map(section => (
            <SectionCard
              key={section.id}
              section={section}
              onNavigate={path => { onNavigate(path); onClose() }}
              onPrompt={() => {}}
              onOpenURL={url => window.open(url, '_blank', 'noopener,noreferrer')}
            />
          ))}
        </div>

        {/* Sign Out */}
        <div className="px-5 pt-3 pb-6 flex-shrink-0" style={{ borderTop: '1px solid var(--separator)' }}>
          <button
            onClick={onSignOut}
            className="w-full rounded-full py-3.5 text-[18px] font-normal transition-opacity hover:opacity-75 active:opacity-50"
            style={{ background: 'rgba(255,59,48,0.12)', color: '#ff3b30' }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </>
  )
}
