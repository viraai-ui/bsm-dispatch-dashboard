import { DashboardShell } from '@/components/DashboardShell'
import { WoodenPackingClient } from '@/components/WoodenPackingClient'
import { buildWoodenPackingQueue } from '@/lib/wooden-packing'

import { hasPageAccess } from '@/lib/page-auth'

export const dynamic = 'force-dynamic'

export default async function WoodenPackingPage() {
  const authed = await hasPageAccess(['Admin', 'Operations'])
  const queue = authed ? await buildWoodenPackingQueue() : { items: [], lastSuccessAt: null }
  return <DashboardShell active="Wooden Packing"><WoodenPackingClient initialQueue={queue} /></DashboardShell>
}
