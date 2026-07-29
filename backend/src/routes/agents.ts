import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { requireWorkspaceMember, WorkspaceRequest } from '../middleware/workspace'
import { supabase } from '../lib/supabase'
import { param } from '../lib/params'

export const agentsRouter = Router({ mergeParams: true })

// Agent triggers now live under their Project/Campaign scope:
//   POST /api/workspaces/:id/projects/:projectId/agents/{research,icp,market-sizing}/run
//   POST /api/workspaces/:id/projects/:projectId/campaigns/:campaignId/agents/architect/run
// This router keeps only the workspace-wide run listing, used by the
// Overview tab to show aggregate status across the whole workspace.

// GET /api/workspaces/:id/agents/runs
agentsRouter.get(
  '/runs',
  requireAuth,
  requireWorkspaceMember,
  async (req: Request, res: Response) => {
    const { workspace } = req as WorkspaceRequest

    const { data, error } = await supabase
      .from('agent_runs')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      res.status(500).json({ error: 'Failed to list agent runs', code: 'DB_ERROR' })
      return
    }

    res.json(data)
  }
)

// GET /api/workspaces/:id/agents/runs/:runId
agentsRouter.get(
  '/runs/:runId',
  requireAuth,
  requireWorkspaceMember,
  async (req: Request, res: Response) => {
    const { workspace } = req as WorkspaceRequest
    const runId = param(req.params.runId)

    const { data, error } = await supabase
      .from('agent_runs')
      .select('*')
      .eq('id', runId)
      .eq('workspace_id', workspace.id)
      .single()

    if (error || !data) {
      res.status(404).json({ error: 'Agent run not found', code: 'NOT_FOUND' })
      return
    }

    res.json(data)
  }
)
