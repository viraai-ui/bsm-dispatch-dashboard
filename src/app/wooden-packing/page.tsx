import { DashboardShell } from '@/components/DashboardShell'
import { WoodenPackingClient } from '@/components/WoodenPackingClient'
import { buildWoodenPackingQueue } from '@/lib/wooden-packing'

export const dynamic = 'force-dynamic'

export default async function WoodenPackingPage() {
  const queue = await buildWoodenPackingQueue()
  return <DashboardShell active="Wooden Packing"><WoodenPackingClient initialQueue={queue} /></DashboardShell>
}
