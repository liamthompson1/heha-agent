'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { basePath } from '@/lib/basePath'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBars } from '@fortawesome/free-solid-svg-icons'

interface StoryAction {
  label: string
  path: string
}

interface Props {
  tripId: string
  params: Record<string, string>
  onNavigate: (path: string) => void
  iconColor?: string
  buttonClassName?: string
}

function extractLinks(markdown: string): StoryAction[] {
  const re = /\[([^\]]+)\]\(([^)"]+?)(?:\s+"[^"]*")?\)/g
  const results: StoryAction[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(markdown)) !== null) {
    let path = m[2]
    if (path.startsWith('#nav/')) path = path.slice(5)
    else if (path.startsWith('nav://')) path = path.slice(6)
    results.push({ label: m[1], path })
  }
  return results
}

export default function TripActionsMenu({ tripId, params, onNavigate, iconColor, buttonClassName }: Props) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<StoryAction[]>([])
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setItems([])
    const qs = new URLSearchParams({ resourcePath: `trips/${tripId}/actions`, format: 'markdown', locale: 'en-GB' })
    Object.entries(params).forEach(([k, v]) => qs.set(k, v))
    fetch(`${basePath}/api/stories?${qs}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.text) setItems(extractLinks(data.text)) })
      .catch(() => {})
  }, [tripId])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleToggle() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setDropdownPos({ top: rect.bottom + 10, right: window.innerWidth - rect.right })
    }
    setOpen(o => !o)
  }

  if (!items.length) return null

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className={`transition-opacity hover:opacity-60 active:opacity-40${buttonClassName ? ` ${buttonClassName}` : ''}`}
        style={{ color: iconColor ?? '#676767' }}
        aria-label="Trip menu"
      >
        <FontAwesomeIcon icon={faBars} style={{ width: 15, height: 15 }} />
      </button>

      {open && dropdownPos && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            right: dropdownPos.right,
            width: '280px',
            borderRadius: '14px',
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'saturate(180%) blur(12px)',
            WebkitBackdropFilter: 'saturate(180%) blur(12px)',
            border: '1px solid rgba(255,255,255,0.18)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
            zIndex: 9999,
          }}
        >
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => { setOpen(false); onNavigate(item.path) }}
              className="w-full text-left px-5 py-3.5 text-[18px] transition-opacity hover:opacity-70 active:opacity-50"
              style={{
                color: 'white',
                borderBottom: i < items.length - 1 ? '1px solid rgba(255,255,255,0.12)' : 'none',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}
