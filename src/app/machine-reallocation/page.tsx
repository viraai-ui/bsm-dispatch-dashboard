import { DashboardShell } from '@/components/DashboardShell'
import { MachineReallocationClient } from '@/components/MachineReallocationClient'
import { getMachineReallocationView } from '@/lib/machine-reallocation'
import { hasPageAccess } from '@/lib/page-auth'

export const dynamic = 'force-dynamic'
export default async function MachineReallocationPage() {
  const authed = await hasPageAccess(['Admin', 'Operations'])
  const initial = authed ? await getMachineReallocationView() : { rows: [], importedOrders: {} }
  return <DashboardShell active="Machine Reallocation"><MachineReallocationClient initial={initial} /></DashboardShell>
}
