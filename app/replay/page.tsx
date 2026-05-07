'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { silentRefresh } from '@/lib/client-auth'

interface SessionSummary {
  sessionId: string
  userId: string
  assetId: string
  startedAt: string | null
  endedAt: string | null
}

export default function ReplayListPage() {
  const router = useRouter()
  const { accessToken, role, setAuth, clearAuth } = useAuthStore()
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      let token = accessToken
      if (!token) {
        const refreshed = await silentRefresh()
        if (!refreshed) { router.replace('/login'); return }
        setAuth(refreshed.accessToken, refreshed.role, refreshed.email)
        token = refreshed.accessToken
      }
      fetchSessions(token)
    }
    init()
  }, [])

  const fetchSessions = async (token: string) => {
    try {
      const res = await fetch('/api/audit/sessions', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { clearAuth(); router.replace('/login'); return }
      const data = await res.json()
      setSessions(data.sessions)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleString()
  }

  const duration = (start: string | null, end: string | null) => {
    if (!start || !end) return '—'
    const ms = new Date(end).getTime() - new Date(start).getTime()
    const s = Math.floor(ms / 1000)
    return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <nav className="border-b border-zinc-800 bg-zinc-900 px-6 py-4 flex items-center justify-between">
        <button onClick={() => router.push('/dashboard')} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Dashboard
        </button>
        <span className="font-semibold">Audit Log</span>
        <span className="text-sm text-zinc-400">{role}</span>
      </nav>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-bold mb-6">Session Recordings</h1>

        {loading ? (
          <div className="py-20 text-center text-zinc-500">Loading sessions…</div>
        ) : sessions.length === 0 ? (
          <div className="py-20 text-center text-zinc-500">No sessions recorded yet.</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-zinc-400">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Session ID</th>
                  <th className="px-4 py-3 text-left font-medium">Started</th>
                  <th className="px-4 py-3 text-left font-medium">Duration</th>
                  <th className="px-4 py-3 text-left font-medium">Asset</th>
                  <th className="px-4 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {sessions.map((s) => (
                  <tr key={s.sessionId} className="bg-zinc-950 hover:bg-zinc-900 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                      {s.sessionId.slice(0, 20)}…
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{formatDate(s.startedAt)}</td>
                    <td className="px-4 py-3 text-zinc-300">{duration(s.startedAt, s.endedAt)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">{s.assetId?.slice(0, 8)}…</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => router.push(`/replay/${s.sessionId}`)}
                        className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
                      >
                        Replay ▶
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}