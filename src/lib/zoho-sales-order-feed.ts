export type ZohoSalesOrderPage = {
  salesorders?: unknown
  page_context?: { page?: number | string; has_more_page?: boolean }
}

const CLOSED_ORDER_STATUSES = new Set(['closed', 'void', 'cancelled', 'canceled', 'rejected', 'deleted'])
const CLOSED_SHIPMENT_STATUSES = new Set(['shipped', 'delivered'])
const CLOSED_INVOICE_STATUSES = new Set(['invoiced'])

function normalized(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

/** Zoho can expose the lifecycle state in different fields across list/detail APIs. */
export function isOpenZohoSalesOrderSummary(raw: any) {
  const orderStatuses = [raw?.status, raw?.current_sub_status, raw?.order_status, raw?.salesorder_status]
    .map(normalized).filter(Boolean)
  const shipment = normalized(raw?.shipment_status)
  const invoiced = normalized(raw?.invoiced_status)
  return !orderStatuses.some((status) => CLOSED_ORDER_STATUSES.has(status))
    && !CLOSED_SHIPMENT_STATUSES.has(shipment)
    && !CLOSED_INVOICE_STATUSES.has(invoiced)
}

/** Fetch every Zoho page or fail closed; a partial feed must never replace durable state. */
export async function fetchCompleteZohoSalesOrderFeed(
  fetchPage: (page: number) => Promise<ZohoSalesOrderPage>,
  maxPages = 500,
) {
  const rows: any[] = []
  const seen = new Set<string>()
  let completed = false

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await fetchPage(page)
    if (!Array.isArray(response.salesorders)) throw new Error(`Invalid Zoho sales order page ${page}`)
    const context = response.page_context || {}
    if (context.page !== undefined && Number(context.page) !== page) throw new Error(`Unexpected Zoho pagination response on page ${page}`)

    for (const row of response.salesorders) {
      const id = String((row as any)?.salesorder_id || '')
      if (!id) throw new Error(`Zoho sales order page ${page} contains a row without an ID`)
      if (seen.has(id)) continue
      seen.add(id)
      rows.push(row)
    }

    if (!context.has_more_page) {
      completed = true
      break
    }
    if (response.salesorders.length === 0) throw new Error(`Zoho pagination stopped early on page ${page}`)
  }

  if (!completed) throw new Error('Zoho pagination limit reached before completion')
  return rows
}
