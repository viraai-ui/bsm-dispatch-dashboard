'use client'

import { useState } from 'react'

export type NavItem = { label: string; href: string }

export function MobileMenu({ nav, active }: { nav: NavItem[]; active: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="mobile-appbar">
        <a className="mobile-brand" href="/" aria-label="BSM Dispatch home">
          <span className="mobile-logo">BSM</span>
          <span>
            <strong>Dispatch</strong>
            <small>Dashboard</small>
          </span>
        </a>
        <button className="dots-trigger" aria-label="Open module menu" aria-expanded={open} onClick={() => setOpen(true)}>
          <span />
          <span />
          <span />
        </button>
      </div>

      {open && <button className="drawer-scrim" aria-label="Close module menu" onClick={() => setOpen(false)} />}

      <aside className={`mobile-drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="drawer-glow" />
        <div className="drawer-head">
          <div>
            <h2>Modules</h2>
          </div>
          <button className="drawer-close" aria-label="Close menu" onClick={() => setOpen(false)}>×</button>
        </div>
        <nav className="drawer-nav" aria-label="Mobile module navigation">
          {nav.map((item, index) => (
            <a className={item.label === active ? 'active' : ''} href={item.href} key={item.label} onClick={() => setOpen(false)}>
              <span className="module-orb">{String(index + 1).padStart(2, '0')}</span>
              <span>{item.label}</span>
              <em>›</em>
            </a>
          ))}
        </nav>
      </aside>
    </>
  )
}
