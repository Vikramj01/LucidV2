/**
 * Google Drive / Notion OAuth connect + callback. Mounted at a FIXED path
 * (/api/integrations), not nested under /api/workspaces/:id, because the
 * provider redirect URI must be static. The callback route is
 * intentionally public (no requireAuth) — the provider redirects the
 * user's browser there directly, without our JWT — so the signed `state`
 * param is what proves which workspace initiated the connect and that
 * the request wasn't forged.
 */
import { Router, Request, Response } from 'express'
import { requireAuth, AuthedRequest } from '../middleware/auth'
import { prisma } from '../lib/prisma'
import { supabase } from '../lib/supabase'
import { signOAuthState, verifyOAuthState } from '../lib/oauthState'
import { encrypt } from '../lib/crypto'
import { param } from '../lib/params'
import {
  getGoogleDriveConsentUrl,
  exchangeGoogleDriveCode,
} from '../lib/integrations/google-drive'
import { getNotionConsentUrl, exchangeNotionCode } from '../lib/integrations/notion'

export const integrationsOAuthRouter = Router()

const PROVIDERS = ['google_drive', 'notion'] as const
type Provider = (typeof PROVIDERS)[number]

function isProvider(value: string): value is Provider {
  return (PROVIDERS as readonly string[]).includes(value)
}

function frontendVaultUrl(workspaceId: string, query: string): string {
  const base = process.env.FRONTEND_URL ?? ''
  return `${base.replace(/\/$/, '')}/dashboard/${workspaceId}?tab=vault&${query}`
}

// GET /api/integrations/:provider/connect?workspace_id=...
integrationsOAuthRouter.get(
  '/:provider/connect',
  requireAuth,
  async (req: Request, res: Response) => {
    const { user } = req as AuthedRequest
    const provider = param(req.params.provider)
    const workspaceId = req.query.workspace_id as string | undefined

    if (!isProvider(provider)) {
      res.status(404).json({ error: 'Unknown provider', code: 'NOT_FOUND' })
      return
    }
    if (!workspaceId) {
      res.status(400).json({ error: 'workspace_id query param is required', code: 'VALIDATION_ERROR' })
      return
    }

    const profile = await prisma.profile.findUnique({ where: { id: user.id } })
    if (!profile) {
      res.status(401).json({ error: 'Profile not found', code: 'AUTH_NO_PROFILE' })
      return
    }

    let authorized = profile.role === 'super_admin'
    if (!authorized && profile.role === 'org_admin') {
      const workspace = await prisma.workspace.findFirst({ where: { id: workspaceId, orgId: profile.orgId ?? '' } })
      authorized = workspace !== null
    }
    if (!authorized) {
      const membership = await prisma.workspaceMember.findUnique({
        where: { workspaceId_profileId: { workspaceId, profileId: user.id } },
      })
      authorized = membership !== null
    }

    if (!authorized) {
      res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' })
      return
    }

    const state = signOAuthState(workspaceId, user.id)

    try {
      const consentUrl =
        provider === 'google_drive' ? getGoogleDriveConsentUrl(state) : getNotionConsentUrl(state)
      res.redirect(consentUrl)
    } catch (err) {
      res.status(500).json({ error: `Failed to build consent URL: ${(err as Error).message}`, code: 'CONFIG_ERROR' })
    }
  }
)

// GET /api/integrations/:provider/callback?code=...&state=...
integrationsOAuthRouter.get('/:provider/callback', async (req: Request, res: Response) => {
  const provider = param(req.params.provider)
  const code = req.query.code as string | undefined
  const stateToken = req.query.state as string | undefined

  if (!isProvider(provider)) {
    res.status(404).json({ error: 'Unknown provider', code: 'NOT_FOUND' })
    return
  }
  if (!code || !stateToken) {
    res.status(400).send('Missing code or state')
    return
  }

  const state = verifyOAuthState(stateToken)
  if (!state) {
    res.status(400).send('Invalid or expired OAuth state')
    return
  }

  try {
    if (provider === 'google_drive') {
      const tokens = await exchangeGoogleDriveCode(code)
      const expiresAt = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null

      await supabase.from('workspace_integrations').upsert(
        {
          workspace_id: state.workspace_id,
          provider: 'google_drive',
          status: 'connected',
          access_token_encrypted: encrypt(tokens.access_token),
          refresh_token_encrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
          token_expires_at: expiresAt,
          connected_by: state.profile_id,
          error_message: null,
        },
        { onConflict: 'workspace_id,provider' }
      )
    } else {
      const tokens = await exchangeNotionCode(code)

      await supabase.from('workspace_integrations').upsert(
        {
          workspace_id: state.workspace_id,
          provider: 'notion',
          status: 'connected',
          access_token_encrypted: encrypt(tokens.access_token),
          refresh_token_encrypted: null,
          token_expires_at: null,
          external_account_id: tokens.workspace_id ?? null,
          external_account_label: tokens.workspace_name ?? null,
          connected_by: state.profile_id,
          error_message: null,
        },
        { onConflict: 'workspace_id,provider' }
      )
    }

    res.redirect(frontendVaultUrl(state.workspace_id, `connected=${provider}`))
  } catch (err) {
    res.redirect(frontendVaultUrl(state.workspace_id, `integration_error=${encodeURIComponent((err as Error).message)}`))
  }
})
