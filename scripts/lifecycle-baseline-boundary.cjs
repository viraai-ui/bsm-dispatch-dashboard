'use strict'

const IST_OFFSET = '+05:30'

function lifecycleEnteredAt(workflow, completed) {
  const timestamps = [
    workflow?.processedAt,
    ...Object.values(workflow?.machines || {}).map((machine) => machine?.processedAt),
    completed?.completedAt,
  ].filter((value) => typeof value === 'string' && Number.isFinite(Date.parse(value)))

  if (!timestamps.length) return null
  return timestamps.reduce((earliest, value) => Date.parse(value) < Date.parse(earliest) ? value : earliest)
}

function boundaryInstant(boundaryDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(boundaryDate)) throw new Error('Lifecycle boundary must be YYYY-MM-DD')
  return new Date(`${boundaryDate}T00:00:00${IST_OFFSET}`)
}

function isPreBoundaryLifecycle(workflow, completed, boundaryDate) {
  const enteredAt = lifecycleEnteredAt(workflow, completed)
  if (!enteredAt) return false // Unknown provenance is never safe to baseline-tombstone.
  return Date.parse(enteredAt) < boundaryInstant(boundaryDate).getTime()
}

module.exports = { IST_OFFSET, lifecycleEnteredAt, boundaryInstant, isPreBoundaryLifecycle }
