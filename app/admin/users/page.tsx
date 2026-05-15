'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter }                   from 'next/navigation'
import { useForm }                     from 'react-hook-form'
import { zodResolver }                 from '@hookform/resolvers/zod'
import { z }                           from 'zod'
import { useAuthStore }                from '@/store/auth.store'
import { silentRefresh }               from '@/lib/client-auth'

interface User { id: string; email: string; role: 'ADMIN'|'OPERATOR'|'AUDITOR'; created_at: string }

const CreateUserSchema = z.object({
  email:    z.string().email('Valid email required'),
  password: z.string().min(12, 'Min 12 chars')
    .regex(/[A-Z]/, 'Needs uppercase').regex(/[a-z]/, 'Needs lowercase')
    .regex(/[0-9]/, 'Needs number').regex(/[^A-Za-z0-9]/, 'Needs special char'),
  role: z.enum(['ADMIN', 'OPERATOR', 'AUDITOR']),
})
type CreateUserForm = z.infer<typeof CreateUserSchema>

const ROLE_STYLES: Record<string, string> = {
  ADMIN:    'bg-red-900/50 text-red-300 border border-red-800',
  OPERATOR: 'bg-emerald-900/50 text-emerald-300 border border-emerald-800',
  AUDITOR:  'bg-blue-900/50 text-blue-300 border border-blue-800',
}

export default function AdminUsersPage() {
  const router = useRouter()
  const { accessToken, role, email, setAuth, clearAuth } = useAuthStore()
  const [users, setUsers]             = useState<User[]>([])
  const [loading, setLoading]         = useState(true)
  const [creating, setCreating]       = useState(false)
  const [deletingId, setDeletingId]   = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg]   = useState<string | null>(null)
  const [showForm, setShowForm]       = useState(false)
  const [confirmId, setConfirmId]     = useState<string | null>(null)
  const tokenRef                      = useRef<string | null>(null)

  useEffect(() => {
    const init = async () => {
      let token = accessToken
      if (!token) {
        const refreshed = await silentRefresh()
        if (!refreshed) { router.replace('/login'); return }
        setAuth(refreshed.accessToken, refreshed.role, refreshed.email)
        token = refreshed.accessToken
      }
      const payload = JSON.parse(atob(token.split('.')[1]))
      if (payload.role !== 'ADMIN') { router.replace('/dashboard'); return }
      tokenRef.current = token
      fetchUsers(token)
    }
    init()
  }, [])

  const fetchUsers = async (token: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 401) { clearAuth(); router.replace('/login'); return }
      const data = await res.json()
      setUsers(data.users)
    } finally { setLoading(false) }
  }

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<CreateUserForm>({
    resolver: zodResolver(CreateUserSchema),
    defaultValues: { role: 'OPERATOR' },
  })

  const pw = watch('password', '')
  const checks = {
    length: pw.length >= 12, uppercase: /[A-Z]/.test(pw),
    lowercase: /[a-z]/.test(pw), number: /[0-9]/.test(pw), special: /[^A-Za-z0-9]/.test(pw),
  }
  const passed = Object.values(checks).filter(Boolean).length
  const strengthColor = passed <= 2 ? 'bg-red-500' : passed <= 4 ? 'bg-yellow-500' : 'bg-emerald-500'

  const onSubmit = async (data: CreateUserForm) => {
    setCreating(true); setServerError(null); setSuccessMsg(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) {
        setServerError(json.errors ? Object.values(json.errors).flat().join(' · ') : json.message)
        return
      }
      setSuccessMsg(`User ${json.user.email} created.`)
      reset(); setShowForm(false)
      fetchUsers(tokenRef.current!)
    } catch { setServerError('Network error.') }
    finally { setCreating(false) }
  }

  const handleDelete = async (userId: string) => {
    setDeletingId(userId); setServerError(null); setSuccessMsg(null)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${tokenRef.current}` },
      })
      const json = await res.json()
      if (!res.ok) { setServerError(json.message); return }
      setSuccessMsg('User deleted.'); setConfirmId(null)
      fetchUsers(tokenRef.current!)
    } catch { setServerError('Network error.') }
    finally { setDeletingId(null) }
  }

  const selfId = tokenRef.current ? JSON.parse(atob(tokenRef.current.split('.')[1])).userId : null

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <nav className="border-b border-zinc-800 bg-zinc-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/dashboard')} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
            </svg>
            Dashboard
          </button>
          <span className="text-zinc-700">·</span>
          <span className="text-sm font-semibold">User Management</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">{email}</span>
          <span className="rounded-full bg-red-900/60 border border-red-800 px-2 py-0.5 text-xs font-medium text-red-300">{role}</span>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-10 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Users</h1>
            <p className="mt-1 text-sm text-zinc-400">Manage operator, auditor, and admin accounts</p>
          </div>
          <button
            onClick={() => { setShowForm(!showForm); setServerError(null); setSuccessMsg(null) }}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showForm ? 'M6 18L18 6M6 6l12 12' : 'M12 4v16m8-8H4'}/>
            </svg>
            {showForm ? 'Cancel' : 'Add User'}
          </button>
        </div>

        {successMsg && (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-800 bg-emerald-900/30 px-4 py-3 text-sm text-emerald-300">
            <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
            {successMsg}
          </div>
        )}
        {serverError && (
          <div className="flex items-center gap-3 rounded-lg border border-red-800 bg-red-900/30 px-4 py-3 text-sm text-red-300">
            <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            {serverError}
          </div>
        )}

        {showForm && (
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-6">
            <h2 className="text-base font-semibold mb-5">New User</h2>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Email</label>
                <input {...register('email')} type="email" placeholder="user@securegate.local"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"/>
                {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Password</label>
                  <input {...register('password')} type="password" placeholder="Min. 12 characters"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"/>
                  {errors.password && <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>}
                  {pw.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1 flex-1">
                          {[1,2,3,4,5].map(i => (
                            <div key={i} className={`h-1 flex-1 rounded-full ${i <= passed ? strengthColor : 'bg-zinc-700'}`}/>
                          ))}
                        </div>
                        <span className={`text-xs ${passed <= 2 ? 'text-red-400' : passed <= 4 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                          {passed <= 2 ? 'Weak' : passed <= 4 ? 'Fair' : 'Strong'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                        {([['length','12+ chars'],['uppercase','Uppercase'],['lowercase','Lowercase'],['number','Number'],['special','Special char']] as const).map(([k, l]) => (
                          <div key={k} className="flex items-center gap-1.5">
                            <div className={`h-1.5 w-1.5 rounded-full ${checks[k] ? 'bg-emerald-500' : 'bg-zinc-600'}`}/>
                            <span className={`text-xs ${checks[k] ? 'text-zinc-400' : 'text-zinc-600'}`}>{l}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Role</label>
                  <select {...register('role')}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500">
                    <option value="OPERATOR">OPERATOR — Can request sessions</option>
                    <option value="AUDITOR">AUDITOR — Read-only, replay only</option>
                    <option value="ADMIN">ADMIN — Full system access</option>
                  </select>
                  <p className="mt-1.5 text-xs text-zinc-500">
                    {watch('role') === 'ADMIN' && '⚠ Admins can create/delete users and revoke sessions.'}
                    {watch('role') === 'OPERATOR' && 'Can request and run terminal sessions.'}
                    {watch('role') === 'AUDITOR' && 'Can view logs and replay sessions only.'}
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowForm(false); reset() }}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={creating}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors">
                  {creating ? 'Creating…' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-zinc-500 text-sm">Loading users…</div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center text-zinc-500 text-sm">No users found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">User</th>
                  <th className="px-5 py-3 text-left font-medium">Role</th>
                  <th className="px-5 py-3 text-left font-medium">Created</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {users.map(u => {
                  const isSelf = u.id === selfId
                  const isConfirming = confirmId === u.id
                  return (
                    <tr key={u.id} className="bg-zinc-950 hover:bg-zinc-900/50 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-300 uppercase flex-shrink-0">
                            {u.email[0]}
                          </div>
                          <div>
                            <div className="text-white font-medium">{u.email}</div>
                            {isSelf && <div className="text-xs text-zinc-500 mt-0.5">You</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_STYLES[u.role]}`}>{u.role}</span>
                      </td>
                      <td className="px-5 py-4 text-zinc-400 tabular-nums">
                        {new Date(u.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {isSelf ? (
                          <span className="text-xs text-zinc-600 italic">Own account</span>
                        ) : isConfirming ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-zinc-400">Delete {u.email}?</span>
                            <button onClick={() => handleDelete(u.id)} disabled={deletingId === u.id}
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50 transition-colors">
                              {deletingId === u.id ? 'Deleting…' : 'Confirm'}
                            </button>
                            <button onClick={() => setConfirmId(null)}
                              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => { setConfirmId(u.id); setServerError(null); setSuccessMsg(null) }}
                            className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:border-red-800 hover:text-red-400 transition-colors">
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-xs text-zinc-500">
          <svg className="h-4 w-4 flex-shrink-0 mt-0.5 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          Passwords are hashed with bcrypt (12 rounds) and never stored in plaintext. Passwords cannot be recovered — only reset by deleting and recreating the account.
        </div>
      </main>
    </div>
  )
}
