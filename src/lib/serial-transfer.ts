import type { MachineUnit, Order } from '@/types/domain'

export type SerialTransferRequest = {
  serialNumber: string
  sourceOrderId: string
  destinationOrderId: string
  destinationMachineId: string
  sourceCancelled: boolean
  transferredAt: string
  actor: string
}

export type SerialTransferAudit = SerialTransferRequest & {
  sourceSalesOrderNumber: string
  destinationSalesOrderNumber: string
  sourceMachineId: string
  displacedDestinationSerial?: string
  machineSku: string
  machineName: string
}

const value = (input: unknown) => String(input || '').trim()
const compatible = (a: MachineUnit, b: MachineUnit) => value(a.sku).toLowerCase() === value(b.sku).toLowerCase() && value(a.itemName).toLowerCase() === value(b.itemName).toLowerCase()

/** Guarded pure serial reassignment. Persistence adapters must commit all returned records together. */
export function transferSerialOwnership(orders: Record<string, Order>, request: SerialTransferRequest) {
  if (!request.sourceCancelled) throw new Error('Source order must be cancelled before serial transfer')
  const source = orders[request.sourceOrderId]
  const destination = orders[request.destinationOrderId]
  if (!source || !destination) throw new Error('Source and destination orders are required')
  const owners = Object.values(orders).flatMap(order => order.machines.filter(machine => value(machine.serialNumber) === request.serialNumber).map(machine => ({ order, machine })))
  if (owners.length !== 1 || owners[0].order.id !== source.id) throw new Error(`Serial ${request.serialNumber} must have exactly one source owner`)
  const sourceMachine = owners[0].machine
  const destinationMachine = destination.machines.find(machine => machine.id === request.destinationMachineId)
  if (!destinationMachine) throw new Error('Destination machine unit was not found')
  if (!compatible(sourceMachine, destinationMachine)) throw new Error('Destination machine is not compatible with source serial')
  const displacedDestinationSerial = value(destinationMachine.serialNumber) || undefined
  const clearedSource = { ...sourceMachine, serialNumber: '', qrToken: '', status: 'Not Generated' as const, selectedForBatch: false, qrPasted: false, qcDone: false }
  const assignedDestination = { ...destinationMachine, serialNumber: request.serialNumber, qrToken: request.serialNumber, status: 'QR Generated' as const, selectedForBatch: false, qrPasted: false, qcDone: false }
  const next = {
    ...orders,
    [source.id]: { ...source, machines: source.machines.map(machine => machine.id === sourceMachine.id ? clearedSource : machine) },
    [destination.id]: { ...destination, machines: destination.machines.map(machine => machine.id === destinationMachine.id ? assignedDestination : machine) },
  }
  const activeOwners = Object.values(next).flatMap(order => order.machines.filter(machine => value(machine.serialNumber) === request.serialNumber))
  if (activeOwners.length !== 1) throw new Error('Transfer did not produce unique ownership')
  const audit: SerialTransferAudit = { ...request, sourceSalesOrderNumber: source.salesOrderNumber, destinationSalesOrderNumber: destination.salesOrderNumber, sourceMachineId: sourceMachine.id, displacedDestinationSerial, machineSku: sourceMachine.sku, machineName: sourceMachine.itemName }
  return { orders: next, sourceMachine: clearedSource, destinationMachine: assignedDestination, audit }
}

export function duplicateSerials(orders: Record<string, Order>) {
  const seen = new Set<string>(), duplicates = new Set<string>()
  for (const order of Object.values(orders)) for (const machine of order.machines) {
    const serial = value(machine.serialNumber)
    if (!serial) continue
    if (seen.has(serial)) duplicates.add(serial)
    seen.add(serial)
  }
  return [...duplicates].sort()
}
