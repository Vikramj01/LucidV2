import { Router, Request, Response } from 'express'
import { requireAuth, AuthedRequest } from '../middleware/auth'
import { requireWorkspaceMember, WorkspaceRequest } from '../middleware/workspace'
import { supabase } from '../lib/supabase'
import { getProfile } from '../lib/profile'
import { param } from '../lib/params'

export const workspacesRouter = Router()

// GET /api/workspaces/:id
workspacesRouter.get(
  '/:id',
  requireAuth,
  requireWorkspaceMember,
  async (req: Request, res: Response) => {
    const { workspace } = req as WorkspaceRequest

    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', workspace.id)
      .single()

    if (error || !data) {
      res.status(404).json({ error: 'Workspace not found', code: 'NOT_FOUND' })
      return
    }

    res.json(data)
  }
)

// PATCH /api/workspaces/:id — org admins only
workspacesRouter.patch(
  '/:id',
  requireAuth,
  requireWorkspaceMember,
  async (req: Request, res: Response) => {
    const { user } = req as AuthedRequest
    const { workspace, profile } = req as WorkspaceRequest
    const { name, description, agent_mode, credit_soft_cap } = req.body

    if (!['org_admin', 'super_admin'].includes(profile.role)) {
      res.status(403).json({ error: 'Org admin required', code: 'FORBIDDEN' })
      return
    }

    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (agent_mode !== undefined) updates.agent_mode = agent_mode
    if (credit_soft_cap !== undefined) updates.credit_soft_cap = credit_soft_cap

    const { data, error } = await supabase
      .from('workspaces')
      .update(updates)
      .eq('id', workspace.id)
      .select()
      .single()

    if (error || !data) {
      res.status(500).json({ error: 'Failed to update workspace', code: 'DB_ERROR' })
      return
    }

    res.json(data)
  }
)

// GET /api/workspaces/:id/credits
workspacesRouter.get(
  '/:id/credits',
  requireAuth,
  requireWorkspaceMember,
  async (req: Request, res: Response) => {
    const { workspace } = req as WorkspaceRequest

    const { data: ledger } = await supabase
      .from('credit_ledger')
      .select('action_type, credits_used, created_at, agent_run_id')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })

    res.json({ ledger: ledger ?? [] })
  }
)

// GET /api/workspaces/:id/agent-runs — list run history (last 50, reverse chronological)
workspacesRouter.get(
  '/:id/agent-runs',
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

// GET /api/workspaces/:id/agent-runs/:runId — single run status + output
workspacesRouter.get(
  '/:id/agent-runs/:runId',
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
