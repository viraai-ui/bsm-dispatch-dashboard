import { apiOk } from '@/lib/api'
import { orders } from '@/lib/mock-data'

export async function GET() {
  return apiOk(orders)
}
