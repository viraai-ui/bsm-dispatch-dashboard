import { APP_ROLES, getUserStore, hashPassword, isKnownRole, requireUser, safeUser, saveUserStore, type AppUser } from '@/lib/auth'

function normalize(value: unknown) { return String(value || '').trim() }
function normalizeEmail(value: unknown) { return normalize(value).toLowerCase() }
function normalizeUsername(value: unknown) { return normalize(value).toLowerCase() }

export async function GET() {
  const auth = await requireUser(['Admin'])
  if (!auth.ok) return auth.response
  const { users } = await getUserStore()
  return Response.json({ ok: true, users: users.map(safeUser), roles: APP_ROLES })
}

export async function POST(request: Request) {
  const auth = await requireUser(['Admin'])
  if (!auth.ok) return auth.response
  const body = await request.json().catch(() => ({}))
  const name = normalize(body.name)
  const email = normalizeEmail(body.email)
  const username = normalizeUsername(body.username || email.split('@')[0])
  const role = normalize(body.role)
  const password = String(body.password || '')
  if (!name || !email || !username || !password || !isKnownRole(role)) return Response.json({ ok: false, error: 'Missing or invalid user details' }, { status: 400 })
  if (password.length < 4) return Response.json({ ok: false, error: 'Password must be at least 4 characters' }, { status: 400 })
  const store = await getUserStore()
  if (store.users.some((user) => user.email.toLowerCase() === email || user.username.toLowerCase() === username)) return Response.json({ ok: false, error: 'Duplicate email or username' }, { status: 409 })
  const now = new Date().toISOString()
  const user: AppUser = { id: `u-${Date.now()}`, name, email, username, role, active: body.active !== false, passwordHash: await hashPassword(password), createdAt: now, updatedAt: now }
  store.users.push(user)
  await saveUserStore(store)
  return Response.json({ ok: true, user: safeUser(user) })
}

export async function PATCH(request: Request) {
  const auth = await requireUser(['Admin'])
  if (!auth.ok) return auth.response
  const body = await request.json().catch(() => ({}))
  const id = normalize(body.id)
  const store = await getUserStore()
  const index = store.users.findIndex((user) => user.id === id)
  if (index < 0) return Response.json({ ok: false, error: 'User not found' }, { status: 404 })
  const current = store.users[index]
  const nextEmail = body.email !== undefined ? normalizeEmail(body.email) : current.email
  const nextUsername = body.username !== undefined ? normalizeUsername(body.username) : current.username
  const nextRole = body.role !== undefined ? normalize(body.role) : current.role
  if (!nextEmail || !nextUsername || !isKnownRole(nextRole)) return Response.json({ ok: false, error: 'Invalid user details' }, { status: 400 })
  if (store.users.some((user) => user.id !== id && (user.email.toLowerCase() === nextEmail || user.username.toLowerCase() === nextUsername))) return Response.json({ ok: false, error: 'Duplicate email or username' }, { status: 409 })
  const active = body.active !== undefined ? Boolean(body.active) : current.active
  const adminCount = store.users.filter((user) => user.active && user.role === 'Admin' && user.id !== id).length + (active && nextRole === 'Admin' ? 1 : 0)
  if (adminCount < 1) return Response.json({ ok: false, error: 'At least one active Admin is required' }, { status: 400 })
  const passwordHash = body.password ? await hashPassword(String(body.password)) : current.passwordHash
  store.users[index] = { ...current, name: body.name !== undefined ? normalize(body.name) : current.name, email: nextEmail, username: nextUsername, role: nextRole, active, passwordHash, updatedAt: new Date().toISOString() }
  await saveUserStore(store)
  return Response.json({ ok: true, user: safeUser(store.users[index]) })
}

export async function DELETE(request: Request) {
  const auth = await requireUser(['Admin'])
  if (!auth.ok) return auth.response
  const { searchParams } = new URL(request.url)
  const id = normalize(searchParams.get('id'))
  const store = await getUserStore()
  const index = store.users.findIndex((user) => user.id === id)
  if (index < 0) return Response.json({ ok: false, error: 'User not found' }, { status: 404 })
  const current = store.users[index]
  if (current.id === auth.user.id) return Response.json({ ok: false, error: 'You cannot deactivate your own account' }, { status: 400 })
  const activeAdminCount = store.users.filter((user) => user.active && user.role === 'Admin' && user.id !== id).length
  if (current.role === 'Admin' && activeAdminCount < 1) return Response.json({ ok: false, error: 'At least one active Admin is required' }, { status: 400 })
  store.users[index] = { ...current, active: false, updatedAt: new Date().toISOString() }
  await saveUserStore(store)
  return Response.json({ ok: true, user: safeUser(store.users[index]) })
}
