'use client'

import { AuthGate, useAuth } from './AuthGate'
import { MobileMenu, type NavItem } from './MobileMenu'

const nav: NavItem[] = [
  { label: 'Dashboard', href: '/' },
  { label: 'Orders', href: '/orders' },
  { label: 'Wooden Packing', href: '/wooden-packing' },
  { label: 'Dispatch View', href: '/packaging-tv' },
  { label: 'Packing Video', href: '/media-proof' },
  { label: 'Loading Video', href: '/loading-video' },
  { label: 'Database', href: '/database' },
  { label: 'Settings', href: '/settings' },
]

const utilityNav: NavItem[] = [
  { label: 'Units Generator', href: '/units-generator' },
]

function ShellBody({ children, active }: { children: React.ReactNode; active: string }) {
  const { user, logout } = useAuth()
  const dispatchOnly = user.role === 'Dispatch'
  const mediaOnly = user.role === 'Media'
  const visibleNav = dispatchOnly ? nav.filter((item) => item.href === '/packaging-tv') : mediaOnly ? nav.filter((item) => item.href === '/media-proof' || item.href === '/loading-video') : user.role === 'Operations' ? nav.filter((item) => item.href !== '/settings') : nav
  const canUseUtilities = user.role === 'Admin' || user.role === 'Operations'
  const visibleUtilityNav = canUseUtilities ? utilityNav : []
  const mobileHidden = new Set(['/packaging-tv', '/settings'])
  const mobileNav = [...visibleNav, ...visibleUtilityNav].filter((item) => !mobileHidden.has(item.href))
  const singleModule = dispatchOnly
  return <div className={singleModule ? 'shell dispatch-shell single-module-shell' : 'shell'}>
    {!singleModule && <MobileMenu nav={mobileNav} active={active} onLogout={logout} />}
    {!singleModule && <aside className="side">
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
        {visibleUtilityNav.map((item) => <a className={`side-utility-link ${item.label === active ? 'active' : ''}`} href={item.href} key={item.label}>{item.label}</a>)}
        <strong>{user.name || user.role}</strong>
        {user.name !== user.role && <span>{user.role}</span>}
        <button className="btn light" onClick={logout}>Logout</button>
      </div>
    </aside>}
    {singleModule && <button className="dispatch-floating-logout" aria-label="Logout" title="Logout" onClick={logout}>⏻</button>}
    <main className="main">{children}</main>
  </div>
}

export function DashboardShell({ children, active = 'Orders' }: { children: React.ReactNode; active?: string }) {
  return <AuthGate><ShellBody active={active}>{children}</ShellBody></AuthGate>
}

export function Badge({ children, tone = 'blue' }: { children: React.ReactNode; tone?: 'red' | 'green' | 'amber' | 'blue' | 'gray' | 'purple' }) {
  return <span className={`badge ${tone}`}>{children}</span>
}
