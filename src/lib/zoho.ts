import type { MachineUnit, Order, OrderLineItem } from '@/types/domain'

const dc = process.env.ZOHO_DC || 'in'
const accountsDomain = `https://accounts.zoho.${dc}`
const apiDomain = process.env.ZOHO_API_DOMAIN || `https://www.zohoapis.${dc}`

function hasZohoConfig() {
  return Boolean(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET && process.env.ZOHO_REFRESH_TOKEN && process.env.ZOHO_ORGANIZATION_ID)
}

async function getAccessToken() {
  if (!hasZohoConfig()) throw new Error('Zoho credentials are not configured')
  const body = new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    grant_type: 'refresh_token',
  })
  const response = await fetch(`${accountsDomain}/oauth/v2/token`, { method: 'POST', body, cache: 'no-store' })
  const data = await response.json()
  if (!response.ok || !data.access_token) throw new Error(data.error || 'Unable to refresh Zoho token')
  return data.access_token as string
}

async function zohoGet(path: string, token: string) {
  const separator = path.includes('?') ? '&' : '?'
  const url = `${apiDomain}${path}${separator}organization_id=${process.env.ZOHO_ORGANIZATION_ID}`
  const response = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, cache: 'no-store' })
  const data = await response.json()
  if (!response.ok || (data.code && data.code !== 0)) throw new Error(data.message || `Zoho request failed: ${path}`)
  return data
}

const closedStatuses = new Set(['closed', 'void', 'cancelled', 'canceled'])
function isOpenOrder(raw: any) {
  const status = String(raw.status || raw.current_sub_status || '').toLowerCase()
  const shipment = String(raw.shipment_status || '').toLowerCase()
  return !closedStatuses.has(status) && shipment !== 'shipped'
}

function readCustomField(source: any, names: string[]) {
  const fields = source?.custom_fields || source?.custom_field_hash || []
  if (Array.isArray(fields)) {
    const found = fields.find((f: any) => names.some((name) => String(f.label || f.api_name || f.placeholder || '').toLowerCase().includes(name)))
    return found?.value || found?.customfield_value
  }
  for (const key of Object.keys(fields || {})) {
    if (names.some((name) => key.toLowerCase().includes(name))) return fields[key]
  }
  return undefined
}

function mapLineItems(order: any): OrderLineItem[] {
  const orderWooden = readCustomField(order, ['wooden packing', 'wooden', 'packing'])
  const orderWoodenText = String(orderWooden || '').toLowerCase()
  const orderWoodenQty = Number(String(orderWooden || '').replace(/[^0-9.]/g, ''))
  return (order.line_items || []).map((item: any, index: number) => {
    const quantity = Number(item.quantity || 0)
    const shipped = Number(item.quantity_shipped || item.shipped_quantity || 0)
    const itemWooden = readCustomField(item, ['wooden packing', 'wooden', 'packing'])
    const itemWoodenText = String(itemWooden || '').toLowerCase()
    const itemWoodenQty = Number(String(itemWooden || '').replace(/[^0-9.]/g, ''))
    const woodenRequired = itemWoodenText.includes('yes') || itemWoodenQty > 0 || orderWoodenText.includes('yes') || orderWoodenQty > 0
    return {
      id: String(item.line_item_id || item.item_id || `line-${index}`),
      itemName: String(item.name || item.item_name || 'Machine'),
      sku: String(item.sku || ''),
      quantity,
      pendingQuantity: Math.max(0, quantity - shipped),
      woodenPackingRequired: woodenRequired,
      dimensions: item.dimensions,
    }
  })
}

function buildUnits(order: any, lineItems: OrderLineItem[]): MachineUnit[] {
  const units: MachineUnit[] = []
  for (const item of lineItems) {
    for (let i = 1; i <= item.pendingQuantity; i += 1) {
      units.push({
        id: `${order.salesorder_id}-${item.id}-${i}`,
        unitNumber: units.length + 1,
        serialNumber: '',
        qrToken: '',
        orderId: String(order.salesorder_id),
        lineItemId: item.id,
        itemName: item.itemName,
        sku: item.sku,
        customerName: String(order.customer_name || ''),
        salesOrderNumber: String(order.salesorder_number || order.reference_number || ''),
        deliveryDate: String(order.shipment_date || order.delivery_date || order.date || ''),
        status: 'Not Generated',
        selectedForBatch: false,
        woodenPacking: item.woodenPackingRequired ? 'Pending' : 'Not Required',
        qrPasted: false,
        qcDone: false,
        mediaPhotos: 0,
        mediaVideos: 0,
      })
    }
  }
  return units
}

function mapOrderSummary(order: any): Order {
  return {
    id: String(order.salesorder_id),
    zohoSalesOrderId: String(order.salesorder_id),
    salesOrderNumber: String(order.salesorder_number || order.reference_number || ''),
    status: String(order.shipment_status || '').toLowerCase() === 'partially_shipped' ? 'partially_shipped' : 'open',
    customerName: String(order.customer_name || ''),
    customerEmail: order.email,
    customerPhone: order.phone,
    shippingAddress: order.shipping_address?.address || order.shipping_address?.street2 || order.billing_address?.address,
    salesperson: order.salesperson_name || order.salesperson || order.sales_person_name,
    deliveryDate: String(order.shipment_date || order.delivery_date || order.date || ''),
    dashboardStatus: 'Not Generated',
    reviewRequired: false,
    lineItems: [],
    machines: [],
  }
}

function mapOrder(order: any): Order {
  const lineItems = mapLineItems(order)
  const machines = buildUnits(order, lineItems)
  return {
    id: String(order.salesorder_id),
    zohoSalesOrderId: String(order.salesorder_id),
    salesOrderNumber: String(order.salesorder_number || order.reference_number || ''),
    status: String(order.shipment_status || '').toLowerCase() === 'partially_shipped' ? 'partially_shipped' : 'open',
    customerName: String(order.customer_name || ''),
    customerEmail: order.email,
    customerPhone: order.phone,
    shippingAddress: order.shipping_address?.address || order.shipping_address?.street2 || order.billing_address?.address,
    salesperson: order.salesperson_name || order.salesperson || order.sales_person_name,
    deliveryDate: String(order.shipment_date || order.delivery_date || order.date || ''),
    dashboardStatus: machines.length ? 'Not Generated' : 'Review Required',
    reviewRequired: false,
    lineItems,
    machines,
  }
}

export async function fetchZohoOpenOrders(): Promise<Order[]> {
  if (!hasZohoConfig()) throw new Error('Zoho credentials are not configured')
  const token = await getAccessToken()
  const allOrders: any[] = []
  for (let page = 1; page <= 20; page += 1) {
    const list = await zohoGet(`/inventory/v1/salesorders?per_page=200&page=${page}`, token)
    allOrders.push(...(list.salesorders || []))
    const pageContext = list.page_context || {}
    if (!pageContext.has_more_page) break
  }
  const summaries = allOrders.filter(isOpenOrder)
  return summaries.map(mapOrderSummary)
}

export async function fetchZohoOrderDetail(id: string): Promise<Order> {
  if (!hasZohoConfig()) throw new Error('Zoho credentials are not configured')
  const token = await getAccessToken()
  const detail = await zohoGet(`/inventory/v1/salesorders/${id}`, token)
  return mapOrder(detail.salesorder)
}

export function zohoConfigured() { return hasZohoConfig() }
