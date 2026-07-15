import { DashboardShell } from '@/components/DashboardShell'

const providers = [
  {
    key: 'porter',
    name: 'Porter',
    description: 'Book mini trucks, pickup vehicles and commercial transport through Porter.',
    url: 'https://porter.in/',
    logo: 'Porter',
    accent: 'porter',
    button: 'Open Porter',
  },
  {
    key: 'rapido',
    name: 'Rapido',
    description: 'Book bike taxis and parcel delivery through Rapido.',
    url: 'https://www.rapido.bike/',
    logo: 'Rapido',
    accent: 'rapido',
    button: 'Open Rapido',
  },
]

export default function VehicleDispatchPage() {
  return <DashboardShell active="Vehicle / Dispatch">
    <main className="vehicle-launcher-page">
      <section className="vehicle-launcher-hero">
        <span className="eyebrow">Transport Apps</span>
        <h1 className="h1">Vehicle / Dispatch</h1>
        <p className="muted">Quick access to trusted third-party vehicle booking platforms.</p>
      </section>

      <section className="vehicle-provider-grid" aria-label="Vehicle booking applications">
        {providers.map((provider) => <article className={`vehicle-provider-card ${provider.accent}`} key={provider.key}>
          <a className="vehicle-logo-link" href={provider.url} target="_blank" rel="noreferrer" aria-label={`Open ${provider.name}`}>
            <span className="vehicle-logo-mark">{provider.logo}</span>
          </a>
          <div className="vehicle-provider-copy">
            <h2>{provider.name}</h2>
            <p>{provider.description}</p>
          </div>
          <a className="btn red vehicle-open-btn" href={provider.url} target="_blank" rel="noreferrer">{provider.button}</a>
        </article>)}
      </section>
    </main>
  </DashboardShell>
}
