const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
}

const EXTENSION_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
}

/** Mobile Safari and Android webviews can provide an empty or non-standard File.type. */
export function paymentScreenshotType(name: string, declaredType: string) {
  const type = declaredType.trim().toLowerCase().split(';', 1)[0]
  const extension = name.trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || ''
  const mimeFromType = MIME_TO_EXTENSION[type] ? (type === 'image/jpg' ? 'image/jpeg' : type) : ''
  const mimeFromName = EXTENSION_TO_MIME[extension] || ''
  if (mimeFromType && mimeFromName && mimeFromType !== mimeFromName) return null
  const mimeType = mimeFromType || mimeFromName
  if (!mimeType) return null
  return { mimeType, extension: MIME_TO_EXTENSION[mimeType] }
}

export const PUBLIC_PAYMENT_SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024
export const INTERNAL_PAYMENT_SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024
export const PAYMENT_PROOF_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'] as const
