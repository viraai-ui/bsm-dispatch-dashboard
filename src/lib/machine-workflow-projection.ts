type TransferState = { qrStatus?: string }

/** A transferred record is historical ownership/audit, not state for the source order's current slot. */
export function isTransferredMachineWorkflow(machine: TransferState | null | undefined) {
  return machine?.qrStatus === 'transferred'
}