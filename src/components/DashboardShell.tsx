'use client'

import { AuthGate, useAuth } from './AuthGate'
import { MobileMenu, type NavItem } from './MobileMenu'

const nav: NavItem[] = [
  { label: 'Dashboard', href: '/' },
  { label: 'Orders', href: '/orders' },
  { label: 'Wooden Packing', href: '/wooden-packing' },
  { label: 'Dispatch View', href: '/packaging-tv' },
  { label: 'Video Upload', href: '/media-proof' },
  { label: 'Vehicle & Transportation', href: '/vehicle-dispatch' },
  { label: 'Database', href: '/database' },
  { label: 'Settings', href: '/settings' },
]

function ShellBody({ children, active }: { children: React.ReactNode; active: string }) {
  const { user, logout } = useAuth()
  const dispatchOnly = user.role === 'Dispatch'
  const visibleNav = dispatchOnly ? nav.filter((item) => item.href === '/packaging-tv') : user.role === 'Operations' ? nav.filter((item) => item.href !== '/settings') : nav
  return <div className={dispatchOnly ? 'shell dispatch-shell' : 'shell'}>
    {!dispatchOnly && <MobileMenu nav={visibleNav} active={active} />}
    {!dispatchOnly && <aside className="side">
      <div className="brand">
        <img className="logo bsm-brand-logo" src="/brand/bsm-logo.png" alt="BSM" />
        <div>
          <strong>Dispatch</strong>
          <div className="muted">Dashboard</div>
        </div>
      </div>
      <nav className="nav" aria-label="Dashboard navigation">
        {visibleNav.map((item) => <a className={item.label === active ? 'active' : ''} href={item.href} key={item.label}>{item.label}</a>)}
      </nav>
      <div className="side-user">
        <strong>{user.name}</strong>
        <span>{user.role}</span>
        <button className="btn light" onClick={logout}>Logout</button>
      </div>
    </aside>}
    {dispatchOnly && <button className="btn light dispatch-floating-logout" onClick={logout}>Logout</button>}
    <main className="main">{children}</main>
  </div>
}

export function DashboardShell({ children, active = 'Orders' }: { children: React.ReactNode; active?: string }) {
  return <AuthGate><ShellBody active={active}>{children}</ShellBody></AuthGate>
}

export function Badge({ children, tone = 'blue' }: { children: React.ReactNode; tone?: 'red' | 'green' | 'amber' | 'blue' | 'gray' | 'purple' }) {
  return <span className={`badge ${tone}`}>{children}</span>
}
