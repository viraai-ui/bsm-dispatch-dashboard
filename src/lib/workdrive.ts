import { getZohoAccessToken } from './zoho'

export type WorkDriveUploadResult = {
  fileId: string | null
  url: string | null
  storedInWorkDrive: boolean
  error?: string
}

function uploadDomain() {
  const dc = process.env.ZOHO_DC || 'in'
  return process.env.ZOHO_WORKDRIVE_UPLOAD_DOMAIN || `https://upload.zoho.${dc}`
}

export function workDriveConfigured() {
  return Boolean(process.env.ZOHO_WORKDRIVE_PARENT_ID)
}

export async function uploadVideoToWorkDrive(fileName: string, dataUrl: string, mimeType: string): Promise<WorkDriveUploadResult> {
  return uploadBufferToWorkDrive(fileName, dataUrlToBuffer(dataUrl), mimeType)
}

export async function uploadBufferToWorkDrive(fileName: string, buffer: Buffer, mimeType: string): Promise<WorkDriveUploadResult> {
  const parentId = process.env.ZOHO_WORKDRIVE_PARENT_ID
  if (!parentId) throw new Error('Zoho WorkDrive folder is not configured. Add ZOHO_WORKDRIVE_PARENT_ID in Vercel first.')

  const token = await getZohoAccessToken()
  const response = await fetch(`${uploadDomain()}/workdrive-api/v1/stream/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'x-filename': fileName,
      'x-parent_id': parentId,
      'x-streammode': '1',
      'content-type': mimeType || 'application/octet-stream',
    },
    body: new Uint8Array(buffer),
    cache: 'no-store',
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || data.errors?.[0]?.title || 'Zoho WorkDrive upload failed')
  const first = Array.isArray(data.data) ? data.data[0] : data.data
  const attrs = first?.attributes || first || {}
  const fileId = String(first?.id || attrs.resource_id || attrs.id || '') || null
  const url = attrs.permalink || attrs.download_url || attrs.preview_url || (fileId ? `https://workdrive.zoho.${process.env.ZOHO_DC || 'in'}/file/${fileId}` : null)
  return { fileId, url, storedInWorkDrive: true }
}

function dataUrlToBuffer(dataUrl: string) {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',').pop() || '' : dataUrl
  return Buffer.from(base64, 'base64')
}
