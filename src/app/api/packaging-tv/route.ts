import { apiOk } from '@/lib/api'
import { machines } from '@/lib/mock-data'

export async function GET() {
  return apiOk(machines.filter((machine) => machine.status !== 'Dispatched'))
}
