'use client'

import { useEffect, useState } from 'react'
type Role = 'Admin' | 'Operations Manager' | 'Dispatch Team'
type User = { id: string; name: string; email: string; role: Role; active: boolean }
const roles: Role[] = ['Admin', 'Operations Manager', 'Dispatch Team']
const seed: User[] = [
  { id: 'u-admin', name: 'Admin User', email: 'admin@bsmindia.com', role: 'Admin', active: true },
  { id: 'u-ops', name: 'Operations Manager', email: 'ops@bsmindia.com', role: 'Operations Manager', active: true },
  { id: 'u-dispatch', name: 'Dispatch Team', email: 'dispatch@bsmindia.com', role: 'Dispatch Team', active: true },
]

export function SettingsClient() {
  const [users, setUsers] = useState<User[]>(seed)
  const [profile, setProfile] = useState<User>(seed[0])
  const [draft, setDraft] = useState({ name: '', email: '', role: 'Dispatch Team' as Role })
  useEffect(() => { const stored = JSON.parse(localStorage.getItem('bsm-dispatch-users') || 'null') || seed; const session = JSON.parse(localStorage.getItem('bsm-dispatch-session') || 'null') || stored[0]; setUsers(stored); setProfile(session) }, [])
  const persist = (next: User[]) => { setUsers(next); localStorage.setItem('bsm-dispatch-users', JSON.stringify(next)) }
  const addUser = () => { if (!draft.name || !draft.email) return; persist([...users, { id: `u-${Date.now()}`, ...draft, active: true }]); setDraft({ name: '', email: '', role: 'Dispatch Team' }) }
  const deleteUser = (id: string) => persist(users.filter((u) => u.id !== id || u.id === profile.id))
  const saveProfile = () => { localStorage.setItem('bsm-dispatch-session', JSON.stringify(profile)); persist(users.map((u) => u.id === profile.id ? profile : u)) }
  const logout = () => { localStorage.removeItem('bsm-dispatch-session'); location.href = '/' }
  return <><header className="top"><div><div className="eyebrow">Admin console</div><h1 className="h1">Settings</h1><p className="muted">Profile, login roles, user management and Zoho sync settings.</p></div><button className="btn light" onClick={logout}>Logout</button></header><section className="grid two"><div className="card"><h2>Edit profile</h2><div className="form-grid"><label>Name<input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></label><label>Email<input value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} /></label><label>Role<select value={profile.role} onChange={(e) => setProfile({ ...profile, role: e.target.value as Role })}>{roles.map((r) => <option key={r}>{r}</option>)}</select></label><button className="btn red" onClick={saveProfile}>Save profile</button></div></div><div className="card"><h2>Zoho sync settings</h2><div className="form-grid"><label>Webhook URL<input value="/api/webhooks/zoho/sales-order" readOnly /></label><label>Backup sync frequency<select defaultValue="15"><option value="10">Every 10 minutes</option><option value="15">Every 15 minutes</option><option value="30">Every 30 minutes</option></select></label><label>Conflict handling<select defaultValue="review"><option value="review">Hold for admin review</option><option value="notify">Notify operations manager</option></select></label><button className="btn light">Save sync settings</button></div></div></section><section className="card" style={{ marginTop: 16 }}><h2>Users & roles</h2><div className="form-grid user-add"><input placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /><input placeholder="Email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /><select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}>{roles.map((r) => <option key={r}>{r}</option>)}</select><button className="btn red" onClick={addUser}>Add user</button></div><div className="machine user-list">{users.map((u) => <div className="machine-row" key={u.id}><span><strong>{u.name}</strong><br /><small className="muted">{u.email}</small></span><span className={`badge ${u.role === 'Admin' ? 'red' : u.role === 'Operations Manager' ? 'blue' : 'green'}`}>{u.role}</span><button className="btn light" disabled={u.id === profile.id} onClick={() => deleteUser(u.id)}>Delete</button></div>)}</div></section></>
}
