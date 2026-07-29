import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { requireWorkspaceMember, WorkspaceRequest } from '../middleware/workspace'
import { supabase } from '../lib/supabase'
import { param } from '../lib/params'

export const integrationsRouter = Router({ mergeParams: true })

const PROVIDERS = ['google_drive', 'notion']

// GET /api/workspaces/:id/integrations — connection status only, never token material.
// Reads the workspace_integrations_public view (safe columns only), same
// as the frontend would via a direct Supabase client — backend doesn't
// need to see the tokens to report connection status.
integrationsRouter.get(
  '/',
  requireAuth,
  requireWorkspaceMember,
  async (req: Request, res: Response) => {
    const { workspace } = req as WorkspaceRequest

    const { data, error } = await supabase
      .from('workspace_integrations_public')
      .select('*')
      .eq('workspace_id', workspace.id)

    if (error) {
      res.status(500).json({ error: 'Failed to list integrations', code: 'DB_ERROR' })
      return
    }

    res.json(data)
  }
)

// DELETE /api/workspaces/:id/integrations/:provider
integrationsRouter.delete(
  '/:provider',
  requireAuth,
  requireWorkspaceMember,
  async (req: Request, res: Response) => {
    const { workspace } = req as WorkspaceRequest
    const provider = param(req.params.provider)

    if (!PROVIDERS.includes(provider)) {
      res.status(404).json({ error: 'Unknown provider', code: 'NOT_FOUND' })
      return
    }

    const { error } = await supabase
      .from('workspace_integrations')
      .delete()
      .eq('workspace_id', workspace.id)
      .eq('provider', provider)

    if (error) {
      res.status(500).json({ error: 'Failed to disconnect integration', code: 'DB_ERROR' })
      return
    }

    res.status(204).send()
  }
)
