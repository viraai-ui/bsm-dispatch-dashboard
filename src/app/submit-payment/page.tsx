import type { Metadata } from 'next'
import PublicPaymentForm from './PublicPaymentForm'

export const metadata: Metadata = { title: 'Submit Payment | BSM India', description: 'Securely submit a payment against a BSM sales order.', robots: { index: false, follow: false } }
export default function SubmitPaymentPage() { return <PublicPaymentForm /> }
