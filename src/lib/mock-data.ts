import { addMonths, format, subDays } from 'date-fns'
import type { MachineUnit, Order } from '@/types/domain'

const warrantyEnd = (date: string) => format(subDays(addMonths(new Date(date), 12), 1), 'dd/MM/yyyy')

export const orders: Order[] = [
  {
    id: 'so-1001',
    zohoSalesOrderId: 'z-so-1001',
    salesOrderNumber: 'SO-1001',
    customerName: 'Arihant Foods Pvt Ltd',
    deliveryDate: '22/07/2026',
    dashboardStatus: 'QR Generated',
    reviewRequired: false,
    lineItems: [{ itemName: 'Belt Conveyor', sku: 'BSM-BC-900', quantity: 3, woodenPackingRequired: true, dimensions: '2400 × 900 × 1100 mm' }],
    machines: [1, 2, 3].map((n) => ({
      id: `mu-26270000${n}`,
      serialNumber: `26270000${n}`,
      itemName: 'Belt Conveyor',
      sku: 'BSM-BC-900',
      customerName: 'Arihant Foods Pvt Ltd',
      salesOrderNumber: 'SO-1001',
      deliveryDate: '22/07/2026',
      status: n === 1 ? 'Packing Done' : 'QR Generated',
      woodenPacking: n === 1 ? 'Completed' : 'Pending',
      qrPasted: n === 1,
      qcDone: n === 1,
      mediaPhotos: n === 1 ? 2 : 0,
      mediaVideos: n === 1 ? 1 : 0,
    })),
  },
  {
    id: 'so-1002',
    zohoSalesOrderId: 'z-so-1002',
    salesOrderNumber: 'SO-1002',
    customerName: 'Delhi Packaging Co.',
    deliveryDate: '25/07/2026',
    dashboardStatus: 'Review Required',
    reviewRequired: true,
    lineItems: [{ itemName: 'Bucket Elevator', sku: 'BSM-BE-1200', quantity: 1, woodenPackingRequired: false }],
    machines: [{
      id: 'mu-262700004',
      serialNumber: '262700004',
      itemName: 'Bucket Elevator',
      sku: 'BSM-BE-1200',
      customerName: 'Delhi Packaging Co.',
      salesOrderNumber: 'SO-1002',
      deliveryDate: '25/07/2026',
      status: 'Review Required',
      woodenPacking: 'Not Required',
      qrPasted: false,
      qcDone: false,
      mediaPhotos: 0,
      mediaVideos: 0,
    }],
  },
  {
    id: 'so-1003',
    zohoSalesOrderId: 'z-so-1003',
    salesOrderNumber: 'SO-1003',
    customerName: 'Mumbai Foods LLP',
    deliveryDate: '29/07/2026',
    dashboardStatus: 'Dispatched',
    reviewRequired: false,
    lineItems: [{ itemName: 'Rotary Table', sku: 'BSM-RT-600', quantity: 1, woodenPackingRequired: true }],
    machines: [{
      id: 'mu-262700005', serialNumber: '262700005', itemName: 'Rotary Table', sku: 'BSM-RT-600', customerName: 'Mumbai Foods LLP', salesOrderNumber: 'SO-1003', deliveryDate: '29/07/2026', status: 'Dispatched', woodenPacking: 'Completed', qrPasted: true, qcDone: true, mediaPhotos: 3, mediaVideos: 1, vehicleNumber: 'DL 1 AB 7731', warrantyStart: '10/07/2026', warrantyEnd: warrantyEnd('2026-07-10')
    }],
  },
]

export const machines: MachineUnit[] = orders.flatMap((order) => order.machines)
