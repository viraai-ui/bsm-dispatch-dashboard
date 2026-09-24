import type { Metadata } from 'next'
import { MaintenanceLock } from '@/components/MaintenanceLock'
import { MAINTENANCE_MODE } from '@/lib/maintenance'
import PublicPaymentForm from './PublicPaymentForm'

export const metadata: Metadata = { title: 'Payments | BSM India', description: 'View and submit salesman payments securely.', robots: { index: false, follow: false } }
export default function SubmitPaymentPage() {
  if (!MAINTENANCE_MODE) return <PublicPaymentForm />
  return <div className="maintenance-scope"><div className="maintenance-content" inert aria-hidden="true"><PublicPaymentForm /></div><MaintenanceLock /></div>
}
