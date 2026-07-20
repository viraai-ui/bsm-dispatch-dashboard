import type { Order } from '@/types/domain'
import type { MediaProofRecord } from './media-proof'
import { readMediaProofStore } from './media-proof'
import { buildStageMap, type OrderStage } from './order-stage'
import { listWorkflows, type OrderWorkflow } from './workflow-store'

export type MediaStatus = 'No Media' | 'Pending' | 'Ready' | 'Submitted'
export type StatusTone = 'red' | 'green' | 'amber' | 'blue' | 'gray' | 'purple'

export type OrderStatusProjection = {
  lifecycleStage: OrderStage
  lifecycleLabel: string
  lifecycleTone: StatusTone
  mediaStatus: MediaStatus
  mediaLabel: string
  mediaTone: StatusTone
}

export function lifecycleLabel(stage: OrderStage) {
  return ({ open: 'Open', processed: 'Processed', packed: 'Packed', packing_video: 'Packing Video', loading_video: 'Loading Video', closed: 'Closed' } as Record<OrderStage, string>)[stage]
}

export function lifecycleTone(stage: OrderStage): StatusTone {
  return ({ open: 'gray', processed: 'amber', packed: 'blue', packing_video: 'purple', loading_video: 'purple', closed: 'red' } as Record<OrderStage, StatusTone>)[stage]
}

export function mediaStatusForOrder(order: Order, record?: MediaProofRecord): MediaStatus {
  if (record?.submittedAt) return 'Submitted'
  if (!record) return 'No Media'
  const ready = order.machines.length > 0 && order.machines.every((machine) => (record.units?.[machine.id]?.videos?.length || 0) > 0)
  return ready ? 'Ready' : 'Pending'
}

export function mediaTone(status: MediaStatus): StatusTone {
  return status === 'Submitted' ? 'green' : status === 'Ready' ? 'blue' : status === 'Pending' ? 'amber' : 'gray'
}

export function projectOrderStatus(order: Order, lifecycleStage: OrderStage = 'open', mediaRecord?: MediaProofRecord): OrderStatusProjection {
  const mediaStatus = mediaStatusForOrder(order, mediaRecord)
  return {
    lifecycleStage,
    lifecycleLabel: lifecycleLabel(lifecycleStage),
    lifecycleTone: lifecycleTone(lifecycleStage),
    mediaStatus,
    mediaLabel: mediaStatus,
    mediaTone: mediaTone(mediaStatus),
  }
}

export async function buildOrderStatusMap(orders: Order[], workflows?: Record<string, OrderWorkflow>) {
  const workflowMap = workflows || await listWorkflows()
  const stages = await buildStageMap(workflowMap)
  const packing = await readMediaProofStore('packing')
  const loading = await readMediaProofStore('loading')
  const mediaRecords = { ...packing.records, ...loading.records }
  const statuses: Record<string, OrderStatusProjection> = {}
  for (const order of orders) statuses[order.id] = projectOrderStatus(order, stages[order.id] || 'open', mediaRecords[order.id])
  return { statuses, stages, mediaRecords }
}
