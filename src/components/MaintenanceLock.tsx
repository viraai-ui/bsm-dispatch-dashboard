import { MAINTENANCE_MESSAGE } from '@/lib/maintenance'

export function MaintenanceLock() {
  return (
    <section className="maintenance-lock" role="alertdialog" aria-modal="true" aria-labelledby="maintenance-title" aria-describedby="maintenance-message">
      <div className="maintenance-lock__glow" aria-hidden="true" />
      <div className="maintenance-lock__card">
        <div className="maintenance-lock__mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" role="img">
            <path d="M7 10V8a5 5 0 0 1 10 0v2h1.25A1.75 1.75 0 0 1 20 11.75v8.5A1.75 1.75 0 0 1 18.25 22H5.75A1.75 1.75 0 0 1 4 20.25v-8.5A1.75 1.75 0 0 1 5.75 10H7Zm2 0h6V8a3 3 0 0 0-6 0v2Zm3 4a1.5 1.5 0 0 0-.75 2.8V19h1.5v-2.2A1.5 1.5 0 0 0 12 14Z" />
          </svg>
        </div>
        <p className="maintenance-lock__eyebrow">Scheduled upgrade</p>
        <h1 id="maintenance-title">We’re upgrading the dashboard</h1>
        <p id="maintenance-message" className="maintenance-lock__message">{MAINTENANCE_MESSAGE}</p>
        <div className="maintenance-lock__notice">
          <span aria-hidden="true">!</span>
          <strong>Payments are temporarily disabled</strong>
        </div>
        <p className="maintenance-lock__footnote">Thank you for your patience while we make BSM Dispatch better.</p>
      </div>
    </section>
  )
}
