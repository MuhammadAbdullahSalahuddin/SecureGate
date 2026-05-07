'use client'

import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '@/store/auth.store'
import { silentRefresh } from '@/lib/client-auth'

// xterm.js imports — must be dynamic (SSR would break it)
// We use useEffect to import them client-side only

function TerminalPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { accessToken, setAuth, clearAuth } = useAuthStore()

  // Refs — these don't trigger re-renders
  const terminalDivRef = useRef<HTMLDivElement>(null) // The DOM div xterm.js attaches to
  const xtermRef = useRef<any>(null)                  // The xterm.js Terminal instance
  const fitAddonRef = useRef<any>(null)               // FitAddon for resize calculation
  const socketRef = useRef<Socket | null>(null)        // The socket.io connection
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  // State
  const [status, setStatus] = useState<'connecting' | 'ready' | 'expired' | 'error'>('connecting')
  const [sessionInfo, setSessionInfo] = useState<{
    sessionId: string
    maxSeconds: number
    expiresAt: string
  } | null>(null)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [showExpiredModal, setShowExpiredModal] = useState(false)

  // Read query params — ticket, cols, rows passed from dashboard
  const ticket = searchParams.get('ticket')
  const initialCols = parseInt(searchParams.get('cols') ?? '180')
  const initialRows = parseInt(searchParams.get('rows') ?? '40')

  useEffect(() => {
    if (!ticket) {
      router.replace('/dashboard')
      return
    }

    let isMounted = true

    const initTerminal = async () => {
      // 1. Restore token if page was refreshed
      let token = accessToken
      if (!token) {
        const refreshed = await silentRefresh()
        if (!refreshed) {
          router.replace('/login')
          return
        }
        setAuth(refreshed.accessToken, refreshed.role, refreshed.email)
        token = refreshed.accessToken
      }

      // 2. Dynamically import xterm.js (client-side only — no SSR)
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      
      // Import the CSS for xterm
      await import('@xterm/xterm/css/xterm.css')

      if (!isMounted || !terminalDivRef.current) return

      // 3. Create xterm.js terminal instance
      const xterm = new Terminal({
        theme: {
          background: '#09090b',   // zinc-950
          foreground: '#e4e4e7',   // zinc-200
          cursor: '#10b981',       // emerald-500
          black: '#18181b',
          brightBlack: '#3f3f46',
          red: '#ef4444',
          brightRed: '#f87171',
          green: '#22c55e',
          brightGreen: '#4ade80',
          yellow: '#eab308',
          brightYellow: '#facc15',
          blue: '#3b82f6',
          brightBlue: '#60a5fa',
          magenta: '#a855f7',
          brightMagenta: '#c084fc',
          cyan: '#06b6d4',
          brightCyan: '#22d3ee',
          white: '#d4d4d8',
          brightWhite: '#ffffff',
        },
        fontFamily: 'Menlo, Monaco, "Cascadia Code", "Fira Code", monospace',
        fontSize: 14,
        lineHeight: 1.2,
        cursorBlink: true,
        cursorStyle: 'block',
        scrollback: 5000,          // how many lines to keep in scroll buffer
        cols: initialCols,
        rows: initialRows,
      })

      const fitAddon = new FitAddon()
      xterm.loadAddon(fitAddon)

      // 4. Attach xterm.js to the DOM div
      xterm.open(terminalDivRef.current)
      fitAddon.fit()

      xtermRef.current = xterm
      fitAddonRef.current = fitAddon

      // 5. Connect WebSocket to server.ts
      //    We pass the ticket, cols, rows in the handshake query
      const socket = io('/', {
        path: '/api/socket',
        query: {
          ticket,
          cols: fitAddon.proposeDimensions()?.cols ?? initialCols,
          rows: fitAddon.proposeDimensions()?.rows ?? initialRows,
        },
        transports: ['websocket'],
      })

      socketRef.current = socket

      // 6. WebSocket event handlers

      // Server confirmed the session is live
      socket.on('session:ready', (info: { sessionId: string; maxSeconds: number; expiresAt: string }) => {
        if (!isMounted) return
        setSessionInfo(info)
        setStatus('ready')
        setTimeLeft(info.maxSeconds)
        xterm.focus()
      })

      // SSH output → write to xterm.js
      socket.on('terminal:data', (data: string) => {
        xterm.write(data)
      })

      // Session expired (TTL hit or admin revoked)
      socket.on('session:expired', () => {
        if (!isMounted) return
        // Write red ANSI message directly into the terminal
        xterm.write('\r\n\x1b[31m[SecureGate] Session expired — access revoked.\x1b[0m\r\n')
        setStatus('expired')
        setShowExpiredModal(true)

        // Auto-redirect after 3 seconds
        setTimeout(() => {
          if (isMounted) router.replace('/dashboard')
        }, 3000)
      })

      // Connection error
      socket.on('error', (err: { code: number; message: string }) => {
        if (!isMounted) return
        xterm.write(`\r\n\x1b[31m[SecureGate] Error: ${err.message}\x1b[0m\r\n`)
        setStatus('error')
      })

      socket.on('connect_error', () => {
        if (!isMounted) return
        setStatus('error')
      })

      // 7. xterm.js keystrokes → send to server via WebSocket
      xterm.onData((data: string) => {
        if (socket.connected) {
          socket.emit('terminal:data', data)
        }
      })

      // 8. ResizeObserver watches the terminal div — fires on ANY size change
      //    (window resize, sidebar open/close, CSS changes — not just window resize)
      const resizeObserver = new ResizeObserver(() => {
        if (!fitAddonRef.current || !socketRef.current?.connected) return
        try {
          fitAddonRef.current.fit()
          const dims = fitAddonRef.current.proposeDimensions()
          if (dims) {
            socket.emit('terminal:resize', { cols: dims.cols, rows: dims.rows })
          }
        } catch {
          // ignore resize errors during unmount
        }
      })

      resizeObserver.observe(terminalDivRef.current!)
      resizeObserverRef.current = resizeObserver
    }

    initTerminal()

    // Cleanup on unmount
    return () => {
      isMounted = false
      resizeObserverRef.current?.disconnect()
      socketRef.current?.disconnect()
      xtermRef.current?.dispose()
    }
  }, [ticket])

  // Countdown timer — counts down from maxSeconds
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [timeLeft !== null]) // only start when timeLeft is first set

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const handleEndSession = () => {
    socketRef.current?.disconnect()
    router.replace('/dashboard')
  }

  const isExpiringSoon = timeLeft !== null && timeLeft < 120 // under 2 minutes

  return (
    <div className="flex h-screen flex-col bg-zinc-950">
      {/* Toolbar */}
      <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4">
        <div className="flex items-center gap-3">
          {/* Green dot = connected, red = expired/error */}
          <div className={`h-2.5 w-2.5 rounded-full ${
            status === 'ready' ? 'bg-emerald-500' :
            status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
            'bg-red-500'
          }`} />
          <span className="text-sm font-medium text-zinc-300">
            {status === 'connecting' && 'Connecting…'}
            {status === 'ready' && (sessionInfo?.sessionId ?? 'Session active')}
            {status === 'expired' && 'Session expired'}
            {status === 'error' && 'Connection failed'}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* TTL countdown */}
          {timeLeft !== null && status === 'ready' && (
            <div className={`flex items-center gap-1.5 text-sm font-mono ${
              isExpiringSoon ? 'text-red-400' : 'text-zinc-400'
            }`}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {formatCountdown(timeLeft)}
            </div>
          )}

          <button
            onClick={handleEndSession}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-red-700 hover:text-red-400 transition-colors"
          >
            End Session
          </button>
        </div>
      </div>

      {/* xterm.js container — fills remaining height */}
      <div className="flex-1 overflow-hidden p-1">
        <div ref={terminalDivRef} className="h-full w-full" />
      </div>

      {/* Session Expired Modal */}
      {showExpiredModal && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-50">
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-8 text-center max-w-sm w-full mx-4">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-900">
              <svg className="h-6 w-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white">Session Ended</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Your session has expired or was revoked by an administrator.
            </p>
            <p className="mt-4 text-xs text-zinc-500">Redirecting to dashboard…</p>
          </div>
        </div>
      )}
    </div>
  )
}

// Wrap in Suspense because useSearchParams requires it in Next.js App Router
export default function TerminalPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading terminal…
      </div>
    }>
      <TerminalPageInner />
    </Suspense>
  )
}