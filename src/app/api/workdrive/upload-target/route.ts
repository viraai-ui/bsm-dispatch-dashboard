import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { getZohoAccessToken } from '@/lib/zoho'

export async function GET() {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  const parentId = process.env.ZOHO_WORKDRIVE_PARENT_ID
  if (!parentId) return apiError('Zoho WorkDrive folder is not configured', 400)
  const dc = process.env.ZOHO_DC || 'in'
  const uploadDomain = process.env.ZOHO_WORKDRIVE_UPLOAD_DOMAIN || `https://upload.zoho.${dc}`
  return apiOk({ token: await getZohoAccessToken(), parentId, uploadUrl: `${uploadDomain}/workdrive-api/v1/stream/upload`, dc })
}
