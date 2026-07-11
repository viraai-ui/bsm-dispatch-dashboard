import { DashboardShell } from '@/components/DashboardShell'
import { ModuleHeader, QueueTable, SyncSettingsCard } from '@/components/ModulePages'
export default function SyncMonitorPage() { return <DashboardShell active="Sync Monitor"><ModuleHeader moduleKey="sync" /><section className="grid two"><SyncSettingsCard /><div className="card"><h2>Zoho Log</h2><button className="btn light full">Conflicts</button></div></section><div style={{ height: 16 }} /><QueueTable kind="sync" /></DashboardShell> }
