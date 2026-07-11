import { DashboardShell } from '@/components/DashboardShell'
import { ModuleHeader, QueueTable } from '@/components/ModulePages'
export default function MachineLookupPage() { return <DashboardShell active="Machine Lookup"><ModuleHeader moduleKey="lookup" /><section className="card search-panel"><input placeholder="Search serial, QR token, SO or customer" /><button className="btn red">Lookup</button></section><div style={{ height: 16 }} /><QueueTable kind="lookup" /></DashboardShell> }
