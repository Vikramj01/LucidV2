import { Router, Request, Response } from 'express'
import { requireAuth, AuthedRequest } from '../middleware/auth'
import { requireWorkspaceMember, WorkspaceRequest } from '../middleware/workspace'
import { supabase } from '../lib/supabase'
import { param } from '../lib/params'

export const outputsRouter = Router({ mergeParams: true })

// GET /api/workspaces/:id/market-signals
outputsRouter.get(
  '/market-signals',
  requireAuth,
  requireWorkspaceMember,
  async (req: Request, res: Response) => {
    const { workspace } = req as WorkspaceRequest

    const { data, error } = await supabase
      .from('market_signals')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })

    if (error) {
      res.status(500).json({ error: 'Failed to list market signals', code: 'DB_ERROR' })
      return
    }

    res.json(data)
  }
)

// GET /api/workspaces/:id/market-signals/:sigId
outputsRouter.get(
  '/market-signals/:sigId',
  requireAuth,
  requireWorkspaceMember,
  async (req: Request, res: Response) => {
    const { workspace } = req as WorkspaceRequest
    const sigId = param(req.params.sigId)

    const { data, error } = await supabase
      .from('market_signals')
      .select('*')
      .eq('id', sigId)
      .eq('workspace_id', workspace.id)
      .single()

    if (error || !data) {
      res.status(404).json({ error: 'Market signal not found', code: 'NOT_FOUND' })
      return
    }

    res.json(data)
  }
)

// GET /api/workspaces/:id/playbooks
outputsRouter.get(
  '/playbooks',
  requireAuth,
  requireWorkspaceMember,
  async (req: Request, res: Response) => {
    const { workspace } = req as WorkspaceRequest

    const { data, error } = await supabase
      .from('campaign_playbooks')
      .select(
        'id, workspace_id, campaign_goal, channels, winning_angle, status, version, created_at, updated_at'
      )
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })

    if (error) {
      res.status(500).json({ error: 'Failed to list playbooks', code: 'DB_ERROR' })
      return
    }

    res.json(data)
  }
)

// GET /api/workspaces/:id/playbooks/:pbId
outputsRouter.get(
  '/playbooks/:pbId',
  requireAuth,
  requireWorkspaceMember,
  async (req: Request, res: Response) => {
    const { workspace } = req as WorkspaceRequest
    const pbId = param(req.params.pbId)

    const { data, error } = await supabase
      .from('campaign_playbooks')
      .select('*')
      .eq('id', pbId)
      .eq('workspace_id', workspace.id)
      .single()

    if (error || !data) {
      res.status(404).json({ error: 'Playbook not found', code: 'NOT_FOUND' })
      return
    }

    res.json(data)
  }
)

// PATCH /api/workspaces/:id/playbooks/:pbId/approve
outputsRouter.patch(
  '/playbooks/:pbId/approve',
  requireAuth,
  requireWorkspaceMember,
  async (req: Request, res: Response) => {
    const { user } = req as AuthedRequest
    const { workspace } = req as WorkspaceRequest
    const pbId = param(req.params.pbId)

    const { data, error } = await supabase
      .from('campaign_playbooks')
      .update({
        status: 'approved',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', pbId)
      .eq('workspace_id', workspace.id)
      .select()
      .single()

    if (error || !data) {
      res.status(404).json({ error: 'Playbook not found', code: 'NOT_FOUND' })
      return
    }

    res.json(data)
  }
)

// GET /api/workspaces/:id/playbooks/:pbId/export
outputsRouter.get(
  '/playbooks/:pbId/export',
  requireAuth,
  requireWorkspaceMember,
  async (req: Request, res: Response) => {
    const { workspace } = req as WorkspaceRequest
    const pbId = param(req.params.pbId)
    const format = (req.query.format as string) ?? 'markdown'

    const { data, error } = await supabase
      .from('campaign_playbooks')
      .select('*')
      .eq('id', pbId)
      .eq('workspace_id', workspace.id)
      .single()

    if (error || !data) {
      res.status(404).json({ error: 'Playbook not found', code: 'NOT_FOUND' })
      return
    }

    if (data.status !== 'approved') {
      res
        .status(403)
        .json({ error: 'Playbook must be approved before export', code: 'NOT_APPROVED' })
      return
    }

    if (format === 'markdown') {
      res.setHeader('Content-Type', 'text/markdown')
      res.setHeader('Content-Disposition', `attachment; filename="playbook-${pbId}.md"`)
      res.send(JSON.stringify(data.playbook_content, null, 2))
      return
    }

    res.json(data.playbook_content)
  }
)
