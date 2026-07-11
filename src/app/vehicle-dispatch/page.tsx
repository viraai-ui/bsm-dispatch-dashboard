import { DashboardShell } from '@/components/DashboardShell'
import { ModuleHeader, QueueTable } from '@/components/ModulePages'
export default function VehicleDispatchPage() { return <DashboardShell active="Vehicle / Dispatch"><ModuleHeader moduleKey="vehicle" /><QueueTable kind="vehicle" /></DashboardShell> }
