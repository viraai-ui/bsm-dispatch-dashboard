import { DashboardShell } from '@/components/DashboardShell'
import { SettingsClient } from '@/components/SettingsClient'

export default function SettingsPage() {
  return <DashboardShell active="Settings"><SettingsClient /></DashboardShell>
}
