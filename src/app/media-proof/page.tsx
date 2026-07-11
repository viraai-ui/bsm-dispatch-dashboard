import { DashboardShell } from '@/components/DashboardShell'
import { ModuleHeader, QueueTable } from '@/components/ModulePages'
export default function MediaProofPage() { return <DashboardShell active="Media Proof"><ModuleHeader moduleKey="media" /><QueueTable kind="media" /></DashboardShell> }
