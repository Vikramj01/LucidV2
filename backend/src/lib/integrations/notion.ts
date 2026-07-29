/**
 * Notion OAuth handshake. Notion access tokens for a public integration
 * do not expire and there is no refresh-token flow — the internal token
 * endpoint returns the stored access token as-is for this provider.
 */
const AUTH_BASE = 'https://api.notion.com/v1/oauth/authorize'
const TOKEN_URL = 'https://api.notion.com/v1/oauth/token'

export interface NotionTokenResponse {
  access_token: string
  workspace_id?: string
  workspace_name?: string
  owner?: unknown
}

function getRedirectUri(): string {
  const base = process.env.BACKEND_PUBLIC_URL
  if (!base) throw new Error('BACKEND_PUBLIC_URL not set')
  return `${base.replace(/\/$/, '')}/api/integrations/notion/callback`
}

export function getNotionConsentUrl(state: string): string {
  const clientId = process.env.NOTION_CLIENT_ID
  if (!clientId) throw new Error('NOTION_CLIENT_ID not set')

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    owner: 'user',
    state,
  })
  return `${AUTH_BASE}?${params.toString()}`
}

export async function exchangeNotionCode(code: string): Promise<NotionTokenResponse> {
  const clientId = process.env.NOTION_CLIENT_ID
  const clientSecret = process.env.NOTION_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('NOTION_CLIENT_ID / NOTION_CLIENT_SECRET not set')

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${basicAuth}`,
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(),
    }),
  })

  if (!response.ok) {
    throw new Error(`Notion token exchange failed: ${response.status} ${await response.text()}`)
  }

  return (await response.json()) as NotionTokenResponse
}
