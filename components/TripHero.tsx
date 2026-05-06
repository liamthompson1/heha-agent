'use client'

import { useState, useEffect, useRef } from 'react'
import { StoriesResponse } from '@/lib/types'
import { basePath } from '@/lib/basePath'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSpinner, faImage } from '@fortawesome/free-solid-svg-icons'

interface Props {
  tripId: string
  params: Record<string, string>
}

export default function TripHero({ tripId, params }: Props) {
  const [destination, setDestination] = useState<string | null>(null)
  const [imgSrc, setImgSrc] = useState<string>(`${basePath}/api/trip-image/${tripId}`)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const retriedRef = useRef(false)

  // Fetch destination — runs in parallel with image, not as a gate
  useEffect(() => {
    setDestination(null)
    const qs = new URLSearchParams({ resourcePath: `trips/${tripId}/destination`, format: 'markdown', locale: 'en-GB' })
    Object.entries(params).forEach(([k, v]) => qs.set(k, v))
    fetch(`${basePath}/api/stories?${qs}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: StoriesResponse | null) => {
        if (data?.text) {
          const plain = data.text.replace(/<[^>]+>/g, '').replace(/[#*_`]/g, '').trim()
          if (plain) setDestination(plain)
        }
      })
      .catch(() => {})
  }, [tripId])

  // If the first attempt (no destination) got a 404, retry once destination is known
  useEffect(() => {
    if (!imgFailed || !destination || retriedRef.current) return
    retriedRef.current = true
    setImgFailed(false)
    setImgLoaded(false)
    setImgSrc(`${basePath}/api/trip-image/${tripId}?destination=${encodeURIComponent(destination)}&t=${Date.now()}`)
  }, [imgFailed, destination, tripId])

  // Reset when tripId changes
  useEffect(() => {
    retriedRef.current = false
    setImgLoaded(false)
    setImgFailed(false)
    setImgSrc(`${basePath}/api/trip-image/${tripId}`)
  }, [tripId])

  async function regenerate() {
    if (!destination || regenerating) return
    setRegenerating(true)
    try {
      const res = await fetch(`${basePath}/api/trip-image/${tripId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination }),
      })
      if (res.ok) {
        const blob = await res.blob()
        setImgLoaded(false)
        setImgFailed(false)
        setImgSrc(URL.createObjectURL(blob))
      }
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div className="relative w-full overflow-hidden" style={{ height: '380px' }}>
      {/* Placeholder shown while loading or on failure */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${basePath}/trip-placeholder.png`}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: imgLoaded ? 0 : 1, transition: 'opacity 0.3s' }}
      />

      {/* Actual trip image */}
      {!imgFailed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={imgSrc}
          src={imgSrc}
          alt={destination ?? ''}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.4s' }}
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgFailed(true)}
        />
      )}

      {/* Gradient: transparent → page bg at bottom */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to bottom, transparent 40%, var(--bg) 100%)' }}
      />

      {/* Bottom row: destination name + regenerate button */}
      <div className="absolute bottom-0 left-0 right-0">
        <div className="max-w-3xl mx-auto w-full flex items-end justify-between px-5 pb-4">
          {destination && (
            <h1
              className="text-[52px] font-semibold text-white leading-tight"
              style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}
            >
              {destination}
            </h1>
          )}

          <button
            onClick={regenerate}
            disabled={regenerating || !destination}
            className="flex items-center justify-center w-9 h-9 rounded-full transition-opacity disabled:opacity-40 hover:opacity-75 active:opacity-50 ml-auto"
            style={{
              background: 'rgba(0,0,0,0.35)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.2)',
            }}
            title="Regenerate image"
          >
            {regenerating
              ? <FontAwesomeIcon icon={faSpinner} spin style={{ width: 16, height: 16, color: 'white' }} />
              : <FontAwesomeIcon icon={faImage} style={{ width: 16, height: 16, color: 'white' }} />
            }
          </button>
        </div>
      </div>
    </div>
  )
}
