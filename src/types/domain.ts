export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'PACKAGING_TEAM' | 'DISPATCH_TEAM' | 'VIEWER'
export type MachineStatus = 'QR Pending' | 'QR Generated' | 'QR Printed' | 'Wooden Packing Pending' | 'Ready for Packaging' | 'Packing Done' | 'Media Proof Pending' | 'Vehicle Booked' | 'Dispatched' | 'Review Required'

export type MachineUnit = {
  id: string
  serialNumber: string
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
