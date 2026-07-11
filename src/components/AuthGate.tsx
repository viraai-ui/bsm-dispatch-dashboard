'use client'

import { useEffect, useMemo, useState } from 'react'

type Role = 'Admin' | 'Operations Manager' | 'Dispatch Team'
type User = { id: string; name: string; email: string; role: Role; active: boolean }

const seedUsers: User[] = [
  { id: 'u-admin', name: 'Admin User', email: 'admin@bsmindia.com', role: 'Admin', active: true },
  { id: 'u-ops', name: 'Operations Manager', email: 'ops@bsmindia.com', role: 'Operations Manager', active: true },
  { id: 'u-dispatch', name: 'Dispatch Team', email: 'dispatch@bsmindia.com', role: 'Dispatch Team', active: true },
]

export function getCurrentUser() {
  if (typeof window === 'undefined') return null
  try { return JSON.parse(localStorage.getItem('bsm-dispatch-session') || 'null') as User | null } catch { return null }
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState('admin@bsmindia.com')
  const [password, setPassword] = useState('1231')
  const [error, setError] = useState('')

  const users = useMemo(() => {
    if (typeof window === 'undefined') return seedUsers
    const stored = localStorage.getItem('bsm-dispatch-users')
    if (!stored) localStorage.setItem('bsm-dispatch-users', JSON.stringify(seedUsers))
    return stored ? JSON.parse(stored) as User[] : seedUsers
  }, [ready])

  useEffect(() => {
    setSession(getCurrentUser())
    setReady(true)
  }, [])

  const login = (event: React.FormEvent) => {
    event.preventDefault()
    const user = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.active)
    if (!user || password !== '1231') {
      setError('Invalid login.')
      return
    }
    localStorage.setItem('bsm-dispatch-session', JSON.stringify(user))
    window.dispatchEvent(new Event('bsm-session-changed'))
    setSession(user)
  }

  if (!ready) return null
  if (!session) {
    return (
      <main className="login-screen">
        <section className="login-card card">
          <div className="logo big">BSM</div>
          <h1 className="h1">Login</h1>
          <form className="form-grid" onSubmit={login}>
            <label>Email<select value={email} onChange={(e) => setEmail(e.target.value)}>{users.map((u) => <option value={u.email} key={u.id}>{u.email} · {u.role}</option>)}</select></label>
            <label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" /></label>
            {error && <div className="form-error">{error}</div>}
            <button className="btn red" type="submit">Login</button>
          </form>
        </section>
      </main>
    )
  }
  return <>{children}</>
}
