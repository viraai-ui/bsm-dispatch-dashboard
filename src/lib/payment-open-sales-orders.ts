import type { Order } from '@/types/domain'
import { isOpenZohoSalesOrder } from './open-sales-orders'
import { readSyncedOrdersStore } from './synced-orders'
import { fetchZohoPaymentOpenOrders } from './zoho'

export type PaymentOrderSuggestion = Pick<Order, 'id' | 'salesOrderNumber' | 'customerName' | 'status'>

export function toPaymentOrderSuggestions(orders: Order[]): PaymentOrderSuggestion[] {
  return orders.filter(isOpenZohoSalesOrder).map(({ id, salesOrderNumber, customerName, status }) => ({ id, salesOrderNumber, customerName, status }))
}

/** Read-only payment lookup: it never reads or writes workflow/media/payment state. */
export async function listPaymentOpenSalesOrders(refresh = false) {
  if (refresh) return toPaymentOrderSuggestions(await fetchZohoPaymentOpenOrders())
  const store = await readSyncedOrdersStore()
  return toPaymentOrderSuggestions(store.orderIds.map((id) => store.orders[id]).filter((order): order is Order => Boolean(order)))
}
