/**
 * Signs/verifies the OAuth `state` param carried through the Drive/Notion
 * connect -> provider consent -> callback round trip. Needed because the
 * redirect URI is fixed (not per-workspace), so the callback needs a way
 * to know which workspace initiated the connect. HMAC-signed, not
 * encrypted — workspace_id isn't secret, but the signature must be
 * unforgeable so a caller can't connect an integration to a workspace
 * they don't belong to by crafting their own state value.
 */
import crypto from 'crypto'

interface OAuthState {
  workspace_id: string
  profile_id: string
  nonce: string
  exp: number // unix seconds
}

const STATE_TTL_SECONDS = 600 // 10 minutes

function getSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET
  if (!secret) throw new Error('OAUTH_STATE_SECRET not set')
  return secret
}

// profile_id travels in the signed state because the callback route has no
// requireAuth (the provider redirects the browser there directly, without
// our JWT) — it's the only way to know who to record as connected_by.
export function signOAuthState(workspace_id: string, profile_id: string): string {
  const state: OAuthState = {
    workspace_id,
    profile_id,
    nonce: crypto.randomBytes(16).toString('hex'),
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
  }
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url')
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyOAuthState(token: string): { workspace_id: string; profile_id: string } | null {
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null

  const expectedSig = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url')
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expectedSig)
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null
  }

  let state: OAuthState
  try {
    state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }

  if (state.exp < Math.floor(Date.now() / 1000)) return null

  return { workspace_id: state.workspace_id, profile_id: state.profile_id }
}
