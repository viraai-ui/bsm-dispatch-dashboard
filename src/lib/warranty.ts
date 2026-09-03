export type WarrantyInfo = { valid: boolean; delivery: string; expiry: string }

export function addCalendarMonthsClamped(date: Date, months: number) {
  const end = new Date(date)
  const day = end.getDate()
  end.setDate(1)
  end.setMonth(end.getMonth() + months)
  end.setDate(Math.min(day, new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate()))
  return end
}

export function publicWarrantyInfo(value?: string, now = new Date()): WarrantyInfo {
  const match = String(value || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!match) return { valid: false, delivery: value || '—', expiry: '—' }
  const start = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const end = addCalendarMonthsClamped(start, 13)
  end.setHours(23, 59, 59, 999)
  return { valid: now.getTime() <= end.getTime(), delivery: formatDate(start), expiry: formatDate(end) }
}

export function warrantyEnd(value?: string) {
  if (!value) return '—'
  const info = publicWarrantyInfo(value)
  return info.expiry === '—' ? value : info.expiry
}

function formatDate(value: Date) { return value.toLocaleDateString('en-GB').replaceAll('/', '-') }
