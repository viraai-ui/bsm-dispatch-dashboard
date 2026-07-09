import { MobileMenu, type NavItem } from './MobileMenu'

const nav: NavItem[] = [
  { label: 'Orders', href: '/' },
  { label: 'QR & Serial', href: '/#qr-serial' },
  { label: 'Wooden Packing', href: '/#wooden-packing' },
  { label: 'Packaging TV', href: '/packaging-tv' },
  { label: 'Media Proof', href: '/#media-proof' },
  { label: 'Vehicle / Dispatch', href: '/#vehicle-dispatch' },
  { label: 'Machine Lookup', href: '/m/262700001' },
  { label: 'Sync Monitor', href: '/#sync-monitor' },
]

export function DashboardShell({ children, active = 'Orders' }: { children: React.ReactNode; active?: string }) {
  return (
    <div className="shell">
      <MobileMenu nav={nav} active={active} />
      <aside className="side">
        <div className="brand">
          <div className="logo">BSM</div>
          <div>
            <strong>Dispatch</strong>
            <div className="muted">Machine Passport</div>
          </div>
        </div>
        <nav className="nav" aria-label="Dashboard navigation">
          {nav.map((item) => (
            <a className={item.label === active ? 'active' : ''} href={item.href} key={item.label}>{item.label}</a>
          ))}
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  )
}

export function Badge({ children, tone = 'blue' }: { children: React.ReactNode; tone?: 'red' | 'green' | 'amber' | 'blue' }) {
  return <span className={`badge ${tone}`}>{children}</span>
}
