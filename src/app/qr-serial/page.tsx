import { DashboardShell } from '@/components/DashboardShell'
import { ModuleHeader, QueueTable } from '@/components/ModulePages'

export default function QRSerialPage() {
  return <DashboardShell active="QR & Serial"><ModuleHeader moduleKey="qr" /><section className="grid two"><div className="card"><h2>Label</h2><div className="label-preview" style={{ marginTop: 16 }}><strong>BSM</strong><div className="qrbox" /><b>Serial: 262700001</b><span>SO-1001 · Belt Conveyor</span><span>Arihant Foods Pvt Ltd</span></div></div><div className="card"><h2>Controls</h2><button className="btn red full">Generate serials</button></div></section><div style={{ height: 16 }} /><QueueTable kind="qr" /></DashboardShell>
}
