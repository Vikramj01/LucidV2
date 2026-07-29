/**
 * Backend-internal routes, not part of the public API surface. Guarded by
 * a shared secret header, not a user JWT — these are service-to-service
 * calls from agent-service, which never holds OAuth client secrets itself.
 */
import { Router, Request, Response } from 'express'
import { supabase } from '../lib/supabase'
import { encrypt, decrypt } from '../lib/crypto'
import { param } from '../lib/params'
import { refreshGoogleDriveToken } from '../lib/integrations/google-drive'

export const internalRouter = Router()

function requireInternalApiKey(req: Request, res: Response, next: () => void): void {
  const expected = process.env.INTERNAL_API_KEY
  const provided = req.headers['x-internal-api-key']

  if (!expected || provided !== expected) {
    res.status(401).json({ error: 'Invalid internal API key', code: 'AUTH_INVALID' })
    return
  }
  next()
}

// GET /api/internal/integrations/:id/token
// Returns a valid, refreshed-if-needed plaintext access token for a
// workspace integration. Google Drive tokens are refreshed here when
// expired; Notion tokens don't expire and are returned as-is.
internalRouter.get('/integrations/:id/token', requireInternalApiKey, async (req: Request, res: Response) => {
  const integrationId = param(req.params.id)

  const { data: integration, error } = await supabase
    .from('workspace_integrations')
    .select('*')
    .eq('id', integrationId)
    .single()

  if (error || !integration) {
    res.status(404).json({ error: 'Integration not found', code: 'NOT_FOUND' })
    return
  }

  if (integration.status !== 'connected') {
    res.status(409).json({ error: 'Integration is not connected', code: 'NOT_CONNECTED' })
    return
  }

  try {
    if (integration.provider === 'google_drive') {
      const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at) : null
      const isExpired = expiresAt !== null && expiresAt.getTime() <= Date.now() + 60_000 // 60s clock-skew buffer

      if (isExpired) {
        if (!integration.refresh_token_encrypted) {
          await supabase
            .from('workspace_integrations')
            .update({ status: 'error', error_message: 'Access token expired and no refresh token is stored' })
            .eq('id', integrationId)
          res.status(409).json({ error: 'Integration needs to be reconnected', code: 'REAUTH_REQUIRED' })
          return
        }

        const refreshToken = decrypt(integration.refresh_token_encrypted)
        const refreshed = await refreshGoogleDriveToken(refreshToken)
        const newExpiresAt = refreshed.expires_in
          ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
          : null

        await supabase
          .from('workspace_integrations')
          .update({
            access_token_encrypted: encrypt(refreshed.access_token),
            token_expires_at: newExpiresAt,
            last_synced_at: new Date().toISOString(),
          })
          .eq('id', integrationId)

        res.json({ access_token: refreshed.access_token })
        return
      }
    }

    const accessToken = decrypt(integration.access_token_encrypted)
    await supabase.from('workspace_integrations').update({ last_synced_at: new Date().toISOString() }).eq('id', integrationId)
    res.json({ access_token: accessToken })
  } catch (err) {
    res.status(500).json({ error: `Failed to resolve token: ${(err as Error).message}`, code: 'TOKEN_ERROR' })
  }
})
