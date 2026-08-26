import { githubReadJson, githubRequest } from './workflow-store'

export type PaymentStatus = 'Pending' | 'Payment Received'
export type PaymentMode = 'Bank Transfer' | 'UPI' | 'Credit Card' | 'Debit Card' | 'Other'
export type Payment = {
  id: string
  customerName: string
  salesOrderNumber: string
  /** Optional only for records created before payment details were introduced. */
  paymentAmount?: number
  /** Optional only for records created before payment details were introduced. */
  paymentMode?: PaymentMode
  screenshotUrl?: string
  screenshotKey?: string
  screenshotName?: string
  status: PaymentStatus
  createdBy: string
  createdAt: string
  updatedAt: string
}

type PaymentStore = { payments: Payment[] }
const STORE_PATH = 'data/payments.json'

export function sortPayments(payments: Payment[]) {
  return [...payments].sort((a, b) => {
    const statusOrder = Number(a.status === 'Payment Received') - Number(b.status === 'Payment Received')
    return statusOrder || b.createdAt.localeCompare(a.createdAt)
  })
}

export async function listPayments() {
  const { data } = await githubReadJson<PaymentStore>(STORE_PATH, { payments: [] })
  return sortPayments(data.payments || [])
}

async function updateStore(updater: (payments: Payment[]) => Payment[]) {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await githubReadJson<PaymentStore>(STORE_PATH, { payments: [] })
    const next = { payments: updater(current.data.payments || []) }
    const body: Record<string, string> = {
      message: 'Update payments store',
      content: Buffer.from(JSON.stringify(next, null, 2)).toString('base64'),
    }
    if (current.sha) body.sha = current.sha
    try {
      await githubRequest(`/contents/${STORE_PATH}`, { method: 'PUT', body: JSON.stringify(body) })
      return next.payments
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : ''
      if (!message.includes('sha') && !message.includes('409') && !message.includes('does not match')) break
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Payment update conflict')
}

export async function createPayment(input: Omit<Payment, 'id' | 'status' | 'createdAt' | 'updatedAt'>) {
  const now = new Date().toISOString()
  const payment: Payment = { ...input, id: `payment-${crypto.randomUUID()}`, status: 'Pending', createdAt: now, updatedAt: now }
  await updateStore((payments) => [payment, ...payments])
  return payment
}

export async function updatePaymentStatus(id: string, status: PaymentStatus) {
  let updated: Payment | null = null
  await updateStore((payments) => payments.map((payment) => {
    if (payment.id !== id) return payment
    updated = { ...payment, status, updatedAt: new Date().toISOString() }
    return updated
  }))
  return updated
}
