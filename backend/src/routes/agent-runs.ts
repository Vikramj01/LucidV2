import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { requireWorkspaceMember, WorkspaceRequest } from '../middleware/workspace'
import { supabase } from '../lib/supabase'
import { param } from '../lib/params'

// Workspace-wide agent run history (status badges, run history in Mission
// Control). Per-agent triggers now live under routes/projects.ts (Research)
// and routes/campaigns.ts (Architect) — a run belongs to a Project or
// Campaign, but its status feed is read at the workspace level.
export const agentRunsRouter = Router({ mergeParams: true })

// GET /api/workspaces/:id/agent-runs
agentRunsRouter.get('/', requireAuth, requireWorkspaceMember, async (req: Request, res: Response) => {
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
})

// GET /api/workspaces/:id/agent-runs/:runId
agentRunsRouter.get(
  '/:runId',
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
