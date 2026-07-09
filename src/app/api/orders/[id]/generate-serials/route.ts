import { apiOk } from '@/lib/api'
import { getFinancialYearPrefix, formatSerial } from '@/lib/rules'

export async function POST() {
  const fyPrefix = getFinancialYearPrefix()
  return apiOk({ message: 'Production path uses Postgres transaction + serial_counters row lock before inserting machine_units.', sampleSerial: formatSerial(fyPrefix, 1), idempotency: 'existing machine units are checked before create' })
}
