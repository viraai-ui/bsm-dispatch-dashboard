import { DashboardShell } from '@/components/DashboardShell'
import { ModuleHeader, QueueTable } from '@/components/ModulePages'

export default function QRSerialPage() {
  return <DashboardShell active="QR & Serial"><ModuleHeader moduleKey="qr" /><section className="grid two"><div className="card"><h2>Label preview</h2><div className="label-preview" style={{ marginTop: 16 }}><strong>BSM</strong><div className="qrbox" /><b>Serial: 262700001</b><span>SO-1001 · Belt Conveyor</span><span>Arihant Foods Pvt Ltd</span></div></div><div className="card"><h2>Generation controls</h2><p className="muted">Admin and Operations Manager can generate, reprint and audit QR labels. Dispatch Team can view and scan.</p><button className="btn red full">Generate approved serials</button></div></section><div style={{ height: 16 }} /><QueueTable kind="qr" /></DashboardShell>
}
