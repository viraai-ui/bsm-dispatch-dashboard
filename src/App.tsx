import './App.css'

const metrics = [
  { label: 'Active Dispatches', value: '24', tone: 'green' },
  { label: 'Pending Loads', value: '08', tone: 'amber' },
  { label: 'On-Time Rate', value: '96%', tone: 'blue' },
]

const lanes = [
  ['Delhi NCR', 'Mumbai', 'In transit', '12 trucks'],
  ['Sonipat', 'Jaipur', 'Loading', '5 trucks'],
  ['Ghaziabad', 'Lucknow', 'Scheduled', '7 trucks'],
]

function App() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <nav className="topbar">
          <div className="brand-mark">BSM</div>
          <div className="status-pill">Dispatch Control Room</div>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">New project initialized</p>
            <h1>BSM Dispatch Dashboard</h1>
            <p className="lede">
              A clean operating dashboard foundation for BSM logistics, dispatch visibility,
              lane tracking, and daily movement control.
            </p>
            <div className="actions">
              <span>GitHub + Vercel ready</span>
              <span>React / TypeScript</span>
            </div>
          </div>

          <div className="dashboard-preview" aria-label="Dashboard preview">
            <div className="preview-header">
              <span>Today’s Dispatch Pulse</span>
              <strong>Live Board</strong>
            </div>
            <div className="metric-grid">
              {metrics.map((metric) => (
                <div className={`metric-card ${metric.tone}`} key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </div>
              ))}
            </div>
            <div className="lane-list">
              {lanes.map(([from, to, status, trucks]) => (
                <div className="lane-row" key={`${from}-${to}`}>
                  <div>
                    <strong>{from} → {to}</strong>
                    <span>{trucks}</span>
                  </div>
                  <em>{status}</em>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default App
