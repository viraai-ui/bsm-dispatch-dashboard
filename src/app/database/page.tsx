import { DashboardShell } from '@/components/DashboardShell'
import { DatabaseClient } from '@/components/DatabaseClient'

export default function DatabasePage() {
  return <DashboardShell active="Database"><header className="top compact-top"><div><h1 className="h1">Database</h1></div></header><DatabaseClient /></DashboardShell>
}
