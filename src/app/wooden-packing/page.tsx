import { DashboardShell } from '@/components/DashboardShell'
import { ModuleHeader, QueueTable } from '@/components/ModulePages'
export default function WoodenPackingPage() { return <DashboardShell active="Wooden Packing"><ModuleHeader moduleKey="wooden" /><QueueTable kind="wooden" /></DashboardShell> }
