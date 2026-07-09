export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'PACKAGING_TEAM' | 'DISPATCH_TEAM' | 'VIEWER'
export type MachineStatus = 'QR Pending' | 'QR Generated' | 'QR Printed' | 'Wooden Packing Pending' | 'Ready for Packaging' | 'Packing Done' | 'Media Proof Pending' | 'Vehicle Booked' | 'Dispatched' | 'Review Required'

export type MachineUnit = {
  id: string
  serialNumber: string
  qrToken: string
  orderId: string
  itemName: string
  sku: string
  customerName: string
  salesOrderNumber: string
  deliveryDate: string
  status: MachineStatus
  woodenPacking: 'Required' | 'Not Required' | 'Completed' | 'Pending'
  qrPasted: boolean
  qcDone: boolean
  mediaPhotos: number
  mediaVideos: number
  vehicleNumber?: string
  warrantyStart?: string
  warrantyEnd?: string
}

export type Order = {
  id: string
  zohoSalesOrderId: string
  salesOrderNumber: string
  customerName: string
  deliveryDate: string
  dashboardStatus: MachineStatus
  reviewRequired: boolean
  lineItems: { itemName: string; sku: string; quantity: number; woodenPackingRequired: boolean; dimensions?: string }[]
  machines: MachineUnit[]
}

export const statusTabs: { label: string; status: MachineStatus }[] = [
  { label: 'QR Pending', status: 'QR Pending' },
  { label: 'QR Generated', status: 'QR Generated' },
  { label: 'QR Printed', status: 'QR Printed' },
  { label: 'Wooden Packing', status: 'Wooden Packing Pending' },
  { label: 'Ready for Packaging', status: 'Ready for Packaging' },
  { label: 'Packing Done', status: 'Packing Done' },
  { label: 'Media Pending', status: 'Media Proof Pending' },
  { label: 'Vehicle Booked', status: 'Vehicle Booked' },
  { label: 'Dispatched', status: 'Dispatched' },
  { label: 'Review Required', status: 'Review Required' },
]
