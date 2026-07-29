/**
 * Google Drive OAuth handshake. Backend is the sole owner of the client
 * secret and token refresh — agent-service only ever sees a live,
 * short-lived access token via the internal token endpoint.
 */
const AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPES = ['https://www.googleapis.com/auth/drive.readonly']

export interface OAuthTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

function getRedirectUri(): string {
  const base = process.env.BACKEND_PUBLIC_URL
  if (!base) throw new Error('BACKEND_PUBLIC_URL not set')
  return `${base.replace(/\/$/, '')}/api/integrations/google_drive/callback`
}

export function getGoogleDriveConsentUrl(state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID not set')

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `${AUTH_BASE}?${params.toString()}`
}

export async function exchangeGoogleDriveCode(code: string): Promise<OAuthTokenResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set')

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: getRedirectUri(),
    }),
  })

  if (!response.ok) {
    throw new Error(`Google Drive token exchange failed: ${response.status} ${await response.text()}`)
  }

  return (await response.json()) as OAuthTokenResponse
}

export async function refreshGoogleDriveToken(refreshToken: string): Promise<OAuthTokenResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set')

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    throw new Error(`Google Drive token refresh failed: ${response.status} ${await response.text()}`)
  }

  return (await response.json()) as OAuthTokenResponse
}
