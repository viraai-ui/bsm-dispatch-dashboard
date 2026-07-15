import { NextResponse } from 'next/server'

const accountsDomain = `https://accounts.zoho.${process.env.ZOHO_DC || 'in'}`

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error) return textPage(`Zoho authorization failed: ${error}`, false)
  if (!code) return textPage('Zoho authorization failed: missing code', false)
  if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_CLIENT_SECRET) return textPage('Zoho client is not configured on the server', false)

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    redirect_uri: `${url.origin}/api/zoho/callback`,
    code,
  })

  try {
    const response = await fetch(`${accountsDomain}/oauth/v2/token`, { method: 'POST', body, cache: 'no-store' })
    const data = await response.json()
    if (!response.ok || !data.refresh_token) {
      console.error('Zoho token exchange failed', data)
      return textPage('Zoho connected, but refresh token was not returned. Please revoke this app in Zoho and approve again.', false)
    }
    return tokenPage(data.refresh_token)
  } catch (err) {
    console.error('Zoho callback error', err)
    return textPage('Zoho authorization failed during token exchange.', false)
  }
}

function tokenPage(refreshToken: string) {
  const safe = refreshToken.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return new NextResponse(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Zoho Connected</title><style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f6f7fb;margin:0;display:grid;place-items:center;min-height:100vh;color:#111827}.card{background:white;border:1px solid #e2e8f0;border-radius:24px;padding:28px;max-width:720px;box-shadow:0 20px 60px rgba(15,23,42,.12)}.badge{display:inline-flex;border-radius:999px;padding:8px 12px;font-weight:800;background:#dcfce7;color:#166534}textarea{width:100%;min-height:110px;border:1px solid #e2e8f0;border-radius:14px;padding:12px;margin-top:12px;font-family:monospace}</style></head><body><main class="card"><span class="badge">Success</span><h1>Zoho connected successfully</h1><p>Copy the token below and send it to Vira to finish setup. This page can be closed after copying.</p><textarea readonly>${safe}</textarea></main></body></html>`, { headers: { 'content-type': 'text/html' } })
}

function textPage(message: string, ok: boolean) {
  return new NextResponse(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Zoho ${ok ? 'Connected' : 'Error'}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f6f7fb;margin:0;display:grid;place-items:center;min-height:100vh;color:#111827}.card{background:white;border:1px solid #e2e8f0;border-radius:24px;padding:28px;max-width:560px;box-shadow:0 20px 60px rgba(15,23,42,.12)}.badge{display:inline-flex;border-radius:999px;padding:8px 12px;font-weight:800;background:${ok ? '#dcfce7;color:#166534' : '#fee2e2;color:#991b1b'}}</style></head><body><main class="card"><span class="badge">${ok ? 'Success' : 'Error'}</span><h1>${message}</h1></main></body></html>`, { headers: { 'content-type': 'text/html' } })
}
