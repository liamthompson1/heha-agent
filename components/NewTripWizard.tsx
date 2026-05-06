'use client'

import { useState, useEffect, useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faXmark, faChevronLeft, faChevronRight, faMagnifyingGlass,
  faLocationDot, faPencil, faPlane, faCheck,
} from '@fortawesome/free-solid-svg-icons'
import { AIRPORTS, sortedByDistance, getRecentAirports, saveRecentAirport, type Airport } from '@/lib/airports'
import { matchAliases } from '@/lib/destinationAliases'
import { basePath } from '@/lib/basePath'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlightResult {
  flight: {
    reference: string
    code: string
    carrier: { code: string; name: string; tailfinImage?: string }
  }
  departure: { airport_iata: string; city: string; date: string; time: string }
  arrival:   { airport_iata: string; city: string; date: string; time: string }
  info:      { elapsed: number }
}

interface SelectedFlight {
  airline:          string
  flight_number:    string
  departure_date:   string
  departure_time:   string
  arrival_date:     string
  arrival_time:     string
  from_airport:     string
  to_airport:       string
  direction:        'outbound' | 'return'
  flight_reference: string
  tailfin_image?:   string
}

interface Props {
  onClose:       () => void
  onTripCreated: (tripId: string) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractDestinationHint(name: string): string {
  const match = name.match(/\b(?:in|to|at|for)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/i)
  if (match) return match[1].trim()
  const words = name.trim().split(/\s+/)
  if (words.length === 1 && /^[A-Z]/.test(words[0])) return words[0]
  return ''
}

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function nextMonday(): Date {
  const d = new Date()
  const day = d.getDay()
  const daysUntilMon = day === 1 ? 7 : (8 - day) % 7 || 7
  d.setDate(d.getDate() + daysUntilMon)
  return d
}

function firstOfNextMonth(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 1)
}

function displayDate(iso: string): string {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

// Fetch all flights from airport on date — destination filtering happens client-side
async function fetchFlights(location: string, date: string): Promise<FlightResult[]> {
  const qs = new URLSearchParams({ location, departDate: date })
  const res = await fetch(`${basePath}/api/flights?${qs}`)
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

function filterFlights(flights: FlightResult[], query: string): FlightResult[] {
  if (!query.trim()) return flights
  const q = query.toLowerCase()
  const aliasIatas = matchAliases(q)
  return flights.filter(f =>
    f.flight.carrier.name.toLowerCase().includes(q) ||
    f.flight.code.toLowerCase().includes(q) ||
    f.arrival.airport_iata.toLowerCase().includes(q) ||
    f.arrival.city.toLowerCase().includes(q) ||
    f.departure.time.includes(q) ||
    f.arrival.time.includes(q) ||
    aliasIatas.includes(f.arrival.airport_iata)
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CalendarPicker({ value, onChange, minDate }: {
  value: string
  onChange: (d: string) => void
  minDate: string
}) {
  const todayStr = isoDate(new Date())
  const minStr   = minDate || todayStr
  const minObj   = new Date(minStr + 'T00:00:00')
  const initDate = value ? new Date(value + 'T00:00:00') : minObj

  const [selYear,  setSelYearState]  = useState(initDate.getFullYear())
  const [selMonth, setSelMonthState] = useState(initDate.getMonth())

  const curYear  = new Date().getFullYear()
  const years    = Array.from({ length: 4 }, (_, i) => curYear + i).filter(y => y >= minObj.getFullYear())
  const MONTHS   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const DAY_HDRS = ['M','T','W','T','F','S','S']

  function isMonthDisabled(y: number, m: number) {
    return new Date(y, m + 1, 0) < minObj
  }

  function pickYear(y: number) {
    setSelYearState(y)
    if (isMonthDisabled(y, selMonth)) {
      const first = MONTHS.findIndex((_, m) => !isMonthDisabled(y, m))
      if (first !== -1) setSelMonthState(first)
    }
  }

  const firstDayRaw = new Date(selYear, selMonth, 1).getDay()
  const startOffset = (firstDayRaw + 6) % 7
  const daysInMonth = new Date(selYear, selMonth + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  function cellDate(day: number) {
    return `${selYear}-${String(selMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  const monthTitle = new Date(selYear, selMonth, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <div className="flex flex-col gap-2.5">

      {/* Year row */}
      <div className="glass-panel flex p-1.5 gap-1">
        {years.map(y => (
          <button key={y} onClick={() => pickYear(y)}
            className="flex-1 py-2.5 rounded-xl text-[17px] font-semibold transition-opacity"
            style={{ background: selYear === y ? 'var(--btn-primary)' : 'transparent', color: selYear === y ? '#fff' : 'var(--fg)' }}>
            {y}
          </button>
        ))}
      </div>

      {/* Month grid — 6 columns, 2 rows */}
      <div className="glass-panel p-2">
        <div className="grid grid-cols-6 gap-1">
          {MONTHS.map((m, i) => {
            const disabled = isMonthDisabled(selYear, i)
            const selected = selMonth === i
            return (
              <button key={m} onClick={() => !disabled && setSelMonthState(i)} disabled={disabled}
                className="py-2.5 rounded-xl text-[15px] font-medium transition-opacity disabled:opacity-25"
                style={{ background: selected ? 'var(--btn-primary)' : 'transparent', color: selected ? '#fff' : 'var(--fg)' }}>
                {m}
              </button>
            )
          })}
        </div>
      </div>

      {/* Day grid */}
      <div className="glass-panel px-3 pt-3 pb-2">
        <p className="text-center text-[15px] font-semibold mb-3" style={{ color: 'var(--link)' }}>{monthTitle}</p>
        <div className="grid grid-cols-7 mb-1">
          {DAY_HDRS.map((d, i) => (
            <div key={i} className="text-center text-[13px] font-semibold py-1" style={{ color: 'var(--fg-2)' }}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {cells.map((day, i) => {
            if (!day) return <div key={`e${i}`} />
            const iso        = cellDate(day)
            const isSelected = iso === value
            const isDisabled = iso < minStr
            const isToday    = iso === todayStr
            return (
              <button key={iso} onClick={() => !isDisabled && onChange(iso)} disabled={isDisabled}
                className="flex items-center justify-center h-10 rounded-xl text-[16px] transition-opacity disabled:opacity-20"
                style={{
                  background:    isSelected ? 'var(--btn-primary)' : 'transparent',
                  color:         isSelected ? '#fff' : isToday ? 'var(--link)' : 'var(--fg)',
                  fontWeight:    isSelected || isToday ? 600 : 400,
                  outline:       isToday && !isSelected ? '1.5px solid var(--link)' : 'none',
                  outlineOffset: '-1.5px',
                }}>
                {day}
              </button>
            )
          })}
        </div>
      </div>

    </div>
  )
}

function FlightRow({ flight, onSelect, preferred }: {
  flight:    FlightResult
  onSelect:  () => void
  preferred: boolean
}) {
  const { carrier } = flight.flight
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 px-5 py-3 transition-opacity hover:opacity-75 active:opacity-50 text-left"
      style={{ borderBottom: '1px solid var(--separator)' }}
    >
      <div className="flex-shrink-0 w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center"
        style={{ background: 'var(--input-bg)' }}>
        {carrier.tailfinImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={carrier.tailfinImage} alt={carrier.name} className="w-full h-full object-contain" />
        ) : (
          <span className="text-[11px] font-bold" style={{ color: 'var(--fg-2)' }}>{carrier.code}</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[15px] font-semibold truncate" style={{ color: 'var(--fg)' }}>{carrier.name}</span>
          <span className="text-[13px]" style={{ color: 'var(--fg-3)' }}>{flight.flight.code}</span>
          {preferred && (
            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{ background: 'var(--btn-tint)', color: 'var(--link)' }}>
              Same airline
            </span>
          )}
        </div>
        <div className="text-[13px] mt-0.5" style={{ color: 'var(--fg-2)' }}>
          {flight.departure.airport_iata} → {flight.arrival.airport_iata} · {fmtDuration(flight.info.elapsed)}
        </div>
      </div>

      <div className="flex-shrink-0 text-right">
        <div className="text-[17px] font-semibold" style={{ color: 'var(--fg)' }}>{flight.departure.time}</div>
        <div className="text-[13px]" style={{ color: 'var(--fg-3)' }}>{flight.arrival.time}</div>
      </div>
    </button>
  )
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

export default function NewTripWizard({ onClose, onTripCreated }: Props) {
  const [name,           setName]           = useState('')
  const [airport,        setAirport]        = useState<Airport | null>(null)
  const [airportQuery,   setAirportQuery]   = useState('')
  const [sortedAirports, setSortedAirports] = useState<Airport[]>(AIRPORTS)
  const [locLoading,     setLocLoading]     = useState(false)
  const [recentIds,      setRecentIds]      = useState<string[]>([])
  const [startDate,      setStartDate]      = useState('')
  const [endDate,        setEndDate]        = useState('')
  const [outboundResults,setOutboundResults]= useState<FlightResult[] | null>(null)
  const [returnResults,  setReturnResults]  = useState<FlightResult[] | null>(null)
  const [loadingOutbound,setLoadingOutbound]= useState(false)
  const [loadingReturn,  setLoadingReturn]  = useState(false)
  const [outboundFlight, setOutboundFlight] = useState<SelectedFlight | null>(null)
  const [returnFlight,   setReturnFlight]   = useState<SelectedFlight | null>(null)
  const [flightQuery,    setFlightQuery]    = useState('')
  const [step,           setStep]           = useState(1)
  const [editingFromSummary, setEditingFromSummary] = useState(false)
  const [isCreating,     setIsCreating]     = useState(false)
  const [createError,    setCreateError]    = useState('')

  const inputRef   = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const TOTAL      = 7

  useEffect(() => {
    if (step === 1) setTimeout(() => inputRef.current?.focus(), 300)
    contentRef.current?.scrollTo({ top: 0 })
  }, [step])

  useEffect(() => {
    if (step !== 2) return
    setRecentIds(getRecentAirports())
    setLocLoading(true)
    navigator.geolocation?.getCurrentPosition(
      pos => { setSortedAirports(sortedByDistance(pos.coords.latitude, pos.coords.longitude)); setLocLoading(false) },
      ()  => setLocLoading(false),
      { timeout: 5000 },
    )
  }, [step])

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  function prefetchOutbound(origin: string, date: string) {
    setLoadingOutbound(true)
    setOutboundResults(null)
    fetchFlights(origin, date)
      .then(r => setOutboundResults(r))
      .finally(() => setLoadingOutbound(false))
  }

  function prefetchReturn(origin: string, date: string) {
    setLoadingReturn(true)
    setReturnResults(null)
    fetchFlights(origin, date)
      .then(r => setReturnResults(r))
      .finally(() => setLoadingReturn(false))
  }

  function advanceStep() {
    if (editingFromSummary) { setEditingFromSummary(false); setStep(7) }
    else setStep(s => s + 1)
  }

  function goToStep(target: number) {
    setEditingFromSummary(true)
    setStep(target)
  }

  async function handleCreate() {
    setIsCreating(true)
    setCreateError('')
    try {
      const res = await fetch(`${basePath}/api/trips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          fromDate: startDate,
          toDate:   endDate,
          outboundFlightReference: outboundFlight?.flight_reference,
          inboundFlightReference:  returnFlight?.flight_reference,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create trip')
      const result = json.data?.createTrip
      const tripId = result?.trip?.id ?? result?.existingId
      if (!tripId) throw new Error('No trip ID returned')
      onTripCreated(tripId)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Something went wrong')
      setIsCreating(false)
    }
  }

  const destHint = extractDestinationHint(name)

  const airportList = (() => {
    const q = airportQuery.toLowerCase()
    if (!q) return sortedAirports
    return sortedAirports.filter(a =>
      a.id.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      a.city.toLowerCase().includes(q)
    )
  })()

  // ── Steps ──────────────────────────────────────────────────────────────────

  function renderStep1() {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-[26px] font-semibold tracking-tight mb-1" style={{ color: 'var(--fg)' }}>
            Name your trip
          </h2>
          <p className="text-[16px]" style={{ color: 'var(--fg-2)' }}>Give it a name so you can find it easily.</p>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && name.trim() && advanceStep()}
          placeholder="e.g. Summer in Barcelona"
          className="w-full rounded-2xl px-4 py-4 text-[18px] outline-none"
          style={{ background: 'var(--input-bg)', color: 'var(--fg)' }}
        />
        <button
          onClick={advanceStep}
          disabled={!name.trim()}
          className="w-full rounded-full py-4 text-[18px] font-semibold transition-opacity disabled:opacity-30"
          style={{ background: 'var(--btn-primary)', color: '#fff' }}
        >
          Continue
        </button>
      </div>
    )
  }

  function renderStep2() {
    return (
      <div className="flex flex-col" style={{ height: 'calc(100dvh - 120px)' }}>
        <div className="flex-shrink-0 pb-4">
          <h2 className="text-[26px] font-semibold tracking-tight mb-1" style={{ color: 'var(--fg)' }}>
            Departure airport
          </h2>
          <p className="text-[16px] mb-4" style={{ color: 'var(--fg-2)' }}>Where are you flying from?</p>
          <div className="flex items-center gap-2 rounded-2xl px-4 py-3" style={{ background: 'var(--input-bg)' }}>
            <FontAwesomeIcon icon={faMagnifyingGlass} style={{ width: 15, height: 15, color: 'var(--fg-3)', flexShrink: 0 }} />
            <input
              type="text"
              value={airportQuery}
              onChange={e => setAirportQuery(e.target.value)}
              placeholder="Search airports…"
              className="flex-1 bg-transparent outline-none text-[17px]"
              style={{ color: 'var(--fg)' }}
            />
            {locLoading && (
              <div className="flex-shrink-0 flex items-center gap-1" style={{ color: 'var(--fg-3)' }}>
                <FontAwesomeIcon icon={faLocationDot} style={{ width: 12, height: 12 }} />
                <span className="text-[12px]">Locating…</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto -mx-5">
          {airportList.map(a => (
            <button
              key={a.id}
              onClick={() => { setAirport(a); saveRecentAirport(a.id); advanceStep() }}
              className="w-full flex items-center gap-3 px-5 py-3.5 transition-opacity hover:opacity-75 active:opacity-50 text-left"
              style={{ borderBottom: '1px solid var(--separator)' }}
            >
              <span className="w-10 text-center text-[12px] font-bold rounded-lg py-1 flex-shrink-0"
                style={{ background: 'var(--input-bg)', color: 'var(--link)' }}>
                {a.id}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[17px] font-medium truncate" style={{ color: 'var(--fg)' }}>{a.name}</span>
                  {recentIds.includes(a.id) && (
                    <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: 'var(--input-bg)', color: 'var(--fg-2)' }}>
                      Recent
                    </span>
                  )}
                </div>
                <span className="text-[13px]" style={{ color: 'var(--fg-3)' }}>{a.city}</span>
              </div>
              <FontAwesomeIcon icon={faChevronRight} style={{ width: 12, height: 12, color: 'var(--fg-3)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      </div>
    )
  }

  function renderStep3() {
    const today    = isoDate(new Date())
    const tomorrow = isoDate(new Date(Date.now() + 86400000))
    const chips    = [
      { label: 'Tomorrow',       value: tomorrow },
      { label: 'Next Monday',    value: isoDate(nextMonday()) },
      { label: '1st next month', value: isoDate(firstOfNextMonth()) },
    ]
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-[26px] font-semibold tracking-tight mb-1" style={{ color: 'var(--fg)' }}>Departure date</h2>
          <p className="text-[16px]" style={{ color: 'var(--fg-2)' }}>When are you flying out?</p>
        </div>
        <CalendarPicker value={startDate} onChange={setStartDate} minDate={today} />
        <button
          onClick={() => { if (!startDate) return; prefetchOutbound(airport!.id, startDate); advanceStep() }}
          disabled={!startDate}
          className="w-full rounded-full py-4 text-[18px] font-semibold transition-opacity disabled:opacity-30"
          style={{ background: 'var(--btn-primary)', color: '#fff' }}
        >
          Continue
        </button>
      </div>
    )
  }

  function renderStep4() {
    const minReturn = startDate
      ? isoDate(new Date(new Date(startDate + 'T00:00:00').getTime() + 86400000))
      : isoDate(new Date())
    const chips = startDate ? [
      { label: '+3 nights', value: isoDate(new Date(new Date(startDate + 'T00:00:00').getTime() + 3 * 86400000)) },
      { label: '+1 week',   value: isoDate(new Date(new Date(startDate + 'T00:00:00').getTime() + 7 * 86400000)) },
      { label: '+2 weeks',  value: isoDate(new Date(new Date(startDate + 'T00:00:00').getTime() + 14 * 86400000)) },
    ] : []
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-[26px] font-semibold tracking-tight mb-1" style={{ color: 'var(--fg)' }}>Return date</h2>
          <p className="text-[16px]" style={{ color: 'var(--fg-2)' }}>When are you coming back?</p>
        </div>
        <CalendarPicker value={endDate} onChange={setEndDate} minDate={minReturn} />
        <button
          onClick={() => { if (!endDate) return; if (destHint) setFlightQuery(destHint); advanceStep() }}
          disabled={!endDate}
          className="w-full rounded-full py-4 text-[18px] font-semibold transition-opacity disabled:opacity-30"
          style={{ background: 'var(--btn-primary)', color: '#fff' }}
        >
          Continue
        </button>
      </div>
    )
  }

  function renderFlightStep(
    title: string,
    subtitle: string,
    loading: boolean,
    results: FlightResult[] | null,
    onSelect: (f: SelectedFlight) => void,
    onSkip: () => void,
    preferredCarrier?: string,
  ) {
    const filtered = filterFlights(results ?? [], flightQuery)
    const sorted   = preferredCarrier
      ? [...filtered].sort((a, b) =>
          (b.flight.carrier.name === preferredCarrier ? 1 : 0) -
          (a.flight.carrier.name === preferredCarrier ? 1 : 0))
      : filtered

    function pick(f: FlightResult) {
      onSelect({
        airline:          f.flight.carrier.name,
        flight_number:    f.flight.code,
        departure_date:   f.departure.date,
        departure_time:   f.departure.time,
        arrival_date:     f.arrival.date,
        arrival_time:     f.arrival.time,
        from_airport:     f.departure.airport_iata,
        to_airport:       f.arrival.airport_iata,
        direction:        title.toLowerCase().includes('return') ? 'return' : 'outbound',
        flight_reference: f.flight.reference,
        tailfin_image:    f.flight.carrier.tailfinImage,
      })
    }

    return (
      <div className="flex flex-col" style={{ height: 'calc(100dvh - 120px)' }}>
        <div className="flex-shrink-0 pb-3">
          <div className="flex items-start justify-between mb-1">
            <h2 className="text-[26px] font-semibold tracking-tight" style={{ color: 'var(--fg)' }}>{title}</h2>
            <button onClick={onSkip} className="text-[15px] mt-2 transition-opacity hover:opacity-60" style={{ color: 'var(--link)' }}>
              Skip
            </button>
          </div>
          <p className="text-[16px] mb-3" style={{ color: 'var(--fg-2)' }}>{subtitle}</p>
          <div className="flex items-center gap-2 rounded-2xl px-4 py-3" style={{ background: 'var(--input-bg)' }}>
            <FontAwesomeIcon icon={faMagnifyingGlass} style={{ width: 15, height: 15, color: 'var(--fg-3)', flexShrink: 0 }} />
            <input
              type="text"
              value={flightQuery}
              onChange={e => setFlightQuery(e.target.value)}
              placeholder="Search flights…"
              className="flex-1 bg-transparent outline-none text-[17px]"
              style={{ color: 'var(--fg)' }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto -mx-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <span className="text-[15px]" style={{ color: 'var(--fg-3)' }}>Loading flights…</span>
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
              <FontAwesomeIcon icon={faPlane} style={{ width: 32, height: 32, color: 'var(--fg-3)', marginBottom: 12 }} />
              <p className="text-[17px] font-medium mb-1" style={{ color: 'var(--fg)' }}>No flights found</p>
              <p className="text-[15px]" style={{ color: 'var(--fg-2)' }}>
                {flightQuery ? 'Try clearing the search.' : 'No flights on this date.'}
              </p>
            </div>
          ) : (
            sorted.map((f, i) => (
              <FlightRow key={`${f.flight.reference}-${i}`} flight={f} onSelect={() => pick(f)}
                preferred={!!preferredCarrier && f.flight.carrier.name === preferredCarrier} />
            ))
          )}
        </div>
      </div>
    )
  }

  function renderStep5() {
    return renderFlightStep(
      'Outbound flight',
      `${airport?.id} · ${displayDate(startDate)}`,
      loadingOutbound,
      outboundResults,
      (f) => { setOutboundFlight({ ...f, direction: 'outbound' }); setFlightQuery(airport?.id ?? ''); prefetchReturn(f.to_airport, endDate); advanceStep() },
      () => { setOutboundFlight(null); setFlightQuery(airport?.id ?? ''); advanceStep() },
    )
  }

  function renderStep6() {
    return renderFlightStep(
      'Return flight',
      `${outboundFlight?.to_airport ?? '?'} → ${airport?.id} · ${displayDate(endDate)}`,
      loadingReturn,
      returnResults,
      (f) => { setReturnFlight({ ...f, direction: 'return' }); setFlightQuery(''); advanceStep() },
      () => { setReturnFlight(null); setFlightQuery(''); advanceStep() },
      outboundFlight?.airline,
    )
  }

  function renderStep7() {
    const rows = [
      { label: 'Trip name',       value: name,                                              targetStep: 1 },
      { label: 'Flying from',     value: airport ? `${airport.name} (${airport.id})` : '—', targetStep: 2 },
      { label: 'Departure',       value: displayDate(startDate),                            targetStep: 3 },
      { label: 'Return',          value: displayDate(endDate),                              targetStep: 4 },
      { label: 'Outbound flight', value: outboundFlight ? `${outboundFlight.airline} ${outboundFlight.flight_number} · ${outboundFlight.departure_time}` : 'Not added', targetStep: 5 },
      { label: 'Return flight',   value: returnFlight   ? `${returnFlight.airline} ${returnFlight.flight_number} · ${returnFlight.departure_time}`   : 'Not added', targetStep: 6 },
    ]
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-[26px] font-semibold tracking-tight mb-1" style={{ color: 'var(--fg)' }}>Review your trip</h2>
          <p className="text-[16px]" style={{ color: 'var(--fg-2)' }}>Tap any row to edit.</p>
        </div>
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)' }}>
          {rows.map((row, i) => (
            <button key={row.label} onClick={() => goToStep(row.targetStep)}
              className="w-full flex items-center justify-between px-4 py-3.5 text-left transition-opacity hover:opacity-75"
              style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--separator)' : 'none' }}>
              <div>
                <div className="text-[13px] mb-0.5" style={{ color: 'var(--fg-3)' }}>{row.label}</div>
                <div className="text-[16px] font-medium" style={{ color: 'var(--fg)' }}>{row.value}</div>
              </div>
              <FontAwesomeIcon icon={faPencil} style={{ width: 13, height: 13, color: 'var(--fg-3)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
        {createError && (
          <p className="text-[14px] text-center" style={{ color: '#ff3b30' }}>{createError}</p>
        )}
        <button
          onClick={handleCreate}
          disabled={isCreating}
          className="w-full rounded-full py-4 text-[18px] font-semibold transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: 'var(--btn-primary)', color: '#fff' }}
        >
          {isCreating ? 'Creating trip…' : <><FontAwesomeIcon icon={faCheck} style={{ width: 16, height: 16 }} /> Go to My Trip</>}
        </button>
      </div>
    )
  }

  function renderContent() {
    switch (step) {
      case 1: return renderStep1()
      case 2: return renderStep2()
      case 3: return renderStep3()
      case 4: return renderStep4()
      case 5: return renderStep5()
      case 6: return renderStep6()
      case 7: return renderStep7()
      default: return null
    }
  }

  const isListStep   = step === 2 || step === 5 || step === 6
  const stepTitles   = ['', 'Name', 'Airport', 'Depart', 'Return', 'Outbound', 'Return flight', 'Review']

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{
        background: 'var(--bg)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        animation: 'fadeSlideUp 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94) both',
      }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center h-14 px-5 gap-4"
        style={{ borderBottom: '1px solid var(--separator)' }}
      >
        {/* Back / Close */}
        <div className="w-16 flex items-center">
          {step > 1 && !editingFromSummary ? (
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-1 transition-opacity hover:opacity-60"
              style={{ color: 'var(--link)' }}
            >
              <FontAwesomeIcon icon={faChevronLeft} style={{ width: 14, height: 14 }} />
              <span className="text-[17px]">Back</span>
            </button>
          ) : (
            <button
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-full transition-opacity hover:opacity-60"
              style={{ background: 'var(--input-bg)' }}
            >
              <FontAwesomeIcon icon={faXmark} style={{ width: 13, height: 13, color: 'var(--fg)' }} />
            </button>
          )}
        </div>

        {/* Title */}
        <div className="flex-1 text-center">
          <span className="text-[17px] font-semibold" style={{ color: 'var(--fg)' }}>
            {stepTitles[step]}
          </span>
        </div>

        {/* Step counter */}
        <div className="w-16 flex justify-end">
          <span className="text-[13px]" style={{ color: 'var(--fg-3)' }}>{step}/{TOTAL}</span>
        </div>
      </div>

      {/* Progress */}
      <div className="flex-shrink-0 h-0.5" style={{ background: 'var(--separator)' }}>
        <div className="h-full transition-all duration-300" style={{ width: `${(step / TOTAL) * 100}%`, background: 'var(--btn-primary)' }} />
      </div>

      {/* Content */}
      <div
        ref={contentRef}
        className={`flex-1 ${isListStep ? 'overflow-hidden' : 'overflow-y-auto'}`}
      >
        <div className={`max-w-3xl mx-auto w-full px-5 ${isListStep ? 'h-full flex flex-col' : 'py-6'}`}>
          {renderContent()}
        </div>
      </div>
    </div>
  )
}
