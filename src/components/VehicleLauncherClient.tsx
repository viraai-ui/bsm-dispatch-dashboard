'use client'

import Image from 'next/image'
import { useState } from 'react'

const providers = [
  {
    key: 'rapido',
    name: 'Rapido',
    url: 'https://www.rapido.bike/Home',
    logoSrc: '/vehicle-logos/rapido.jpg',
    accent: 'rapido',
    button: 'Open Rapido',
  },
  {
    key: 'porter',
    name: 'Porter',
    url: 'https://porter.in/enterprise',
    logoSrc: '/vehicle-logos/porter.jpg',
    accent: 'porter',
    button: 'Open Porter',
  },
]

export function VehicleLauncherClient() {
  const [active, setActive] = useState<(typeof providers)[number] | null>(null)

  return <>
    <section className="vehicle-provider-grid" aria-label="Vehicle booking applications">
      {providers.map((provider) => <article className={`vehicle-provider-card ${provider.accent}`} key={provider.key}>
        <button className="vehicle-logo-link" type="button" onClick={() => setActive(provider)} aria-label={`Open ${provider.name} inside dashboard`}>
          <Image className="vehicle-logo-img" src={provider.logoSrc} width={220} height={220} alt={`${provider.name} logo`} priority />
        </button>
        <div className="vehicle-provider-copy">
          <h2>{provider.name}</h2>
        </div>
        <button className="btn red vehicle-open-btn" type="button" onClick={() => setActive(provider)}>{provider.button}</button>
      </article>)}
    </section>

    <section className="vehicle-frame-card" aria-label="Embedded vehicle booking app">
      <div className="vehicle-frame-head">
        <h2>{active ? active.name : 'Booking App'}</h2>
        <span>{active ? active.url : ''}</span>
      </div>
      {active ? <iframe key={active.url} src={active.url} title={`${active.name} booking app`} className="vehicle-booking-frame" /> : <div className="vehicle-frame-empty">Select Porter or Rapido</div>}
    </section>
  </>
}
