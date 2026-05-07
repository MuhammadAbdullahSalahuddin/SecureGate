'use client'

import { useEffect, useRef, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { silentRefresh } from '@/lib/client-auth'

interface AuditEvent {
  _id: string
  sessionId: string
  type: 'session_start' | 'stdin' | 'stdout' | 'resize' | 'session_end'
  data?: string
  cols?: number
  rows?: number
  seqNum: number
  timestamp: string
}

export default function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = use(params)
  const router = useRouter()
  const { accessToken, setAuth, clearAuth } = useAuthStore()

  const terminalDivRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<any>(null)
  const fitAddonRef = useRef<any>(null)
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [eventIndex, setEventIndex] = useState(0)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const init = async () => {
      let token = accessToken
      if (!token) {
        const refreshed = await silentRefresh()
        if (!refreshed) { router.replace('/login'); return }
        setAuth(refreshed.accessToken, refreshed.role, refreshed.email)
        token = refreshed.accessToken
      }

      const res = await fetch(`/api/audit/sessions/${sessionId}/events`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      setEvents(data.events)
      setTotal(data.total)
      setLoading(false)

      // Initialize xterm.js after events are loaded
      await initXterm()
    }
    init()

    return () => {
      timeoutsRef.current.forEach(clearTimeout)
      xtermRef.current?.dispose()
    }
  }, [sessionId])

  const initXterm = async () => {
    const { Terminal } = await import('@xterm/xterm')
    const { FitAddon } = await import('@xterm/addon-fit')
    await import('@xterm/xterm/css/xterm.css')

    if (!terminalDivRef.current) return

    const xterm = new Terminal({
      theme: {
        background: '#09090b',
        foreground: '#e4e4e7',
        cursor: '#10b981',
      },
      fontFamily: 'Menlo, Monaco, "Cascadia Code", monospace',
      fontSize: 14,
      cursorBlink: false,    // No cursor blink in replay — it's not interactive
      disableStdin: true,    // READ ONLY — keyboard input disabled
      scrollback: 10000,
    })

    const fitAddon = new FitAddon()
    xterm.loadAddon(fitAddon)
    xterm.open(terminalDivRef.current)
    fitAddon.fit()

    xtermRef.current = xterm
    fitAddonRef.current = fitAddon
  }

  const play = () => {
    if (!xtermRef.current || events.length === 0) return

    // Clear any existing scheduled timeouts (e.g. if re-playing)
    timeoutsRef.current.forEach(clearTimeout)
    timeoutsRef.current = []

    // Reset terminal to blank state
    xtermRef.current.reset()
    setEventIndex(0)
    setPlaying(true)

    // Schedule each event at the correct relative time
    // delta = time gap between this event and the previous one
    // clamped to max 2000ms so long idle periods don't stall the replay
    let scheduledTime = 0

    events.forEach((event, index) => {
      const prevTimestamp = index === 0 ? event.timestamp : events[index - 1].timestamp
      const delta = new Date(event.timestamp).getTime() - new Date(prevTimestamp).getTime()
      const clampedDelta = Math.min(delta, 2000)
      scheduledTime += clampedDelta / speed

      const timeout = setTimeout(() => {
        setEventIndex(index + 1)

        if (event.type === 'stdout' && event.data) {
          xtermRef.current?.write(event.data)
        }

        if (event.type === 'resize' && event.cols && event.rows) {
          xtermRef.current?.resize(event.cols, event.rows)
        }

        // Mark as not playing when the last event fires
        if (index === events.length - 1) {
          setPlaying(false)
        }
      }, scheduledTime)

      timeoutsRef.current.push(timeout)
    })
  }

  const pause = () => {
    timeoutsRef.current.forEach(clearTimeout)
    timeoutsRef.current = []
    setPlaying(false)
  }

  const reset = () => {
    pause()
    xtermRef.current?.reset()
    setEventIndex(0)
  }

  const progressPercent = total > 0 ? Math.round((eventIndex / total) * 100) : 0

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-white">
      {/* Toolbar */}
      <div className="flex h-14 flex-shrink-0 items-center gap-4 border-b border-zinc-800 bg-zinc-900 px-4">
        <button onClick={() => router.push('/replay')} className="text-zinc-400 hover:text-white transition-colors">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>

        <span className="text-sm text-zinc-400 font-mono">{sessionId.slice(0, 24)}…</span>

        <div className="ml-auto flex items-center gap-3">
          {/* Event counter */}
          <span className="text-xs text-zinc-500 font-mono">
            {eventIndex} / {total} events
          </span>

          {/* Speed selector */}
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-300"
          >
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>

          {/* Reset */}
          <button onClick={reset} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors">
            Reset
          </button>

          {/* Play / Pause */}
          <button
            onClick={playing ? pause : play}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            {playing ? (
              <>
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
                </svg>
                Pause
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Play
              </>
            )}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full bg-zinc-800">
        <div
          className="h-full bg-emerald-500 transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Terminal */}
      <div className="flex-1 overflow-hidden p-1">
        {loading ? (
          <div className="flex h-full items-center justify-center text-zinc-500">
            Loading session events…
          </div>
        ) : events.length === 0 ? (
          <div className="flex h-full items-center justify-center text-zinc-500">
            No events found for this session.
          </div>
        ) : (
          <div ref={terminalDivRef} className="h-full w-full" />
        )}
      </div>
    </div>
  )
}