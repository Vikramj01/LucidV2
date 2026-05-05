import { Router, Request, Response } from 'express'
import { requireAuth, AuthedRequest } from '../middleware/auth'
import { supabase } from '../lib/supabase'

export const workspacesRouter = Router()

// GET /api/workspaces/:id
workspacesRouter.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params

  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) {
    res.status(404).json({ error: 'Workspace not found', code: 'NOT_FOUND' })
    return
  }

  res.json(data)
})

// PATCH /api/workspaces/:id
workspacesRouter.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const { user } = req as AuthedRequest
  const { id } = req.params
  const { name, description, agent_mode, credit_soft_cap } = req.body

  // Only org_admin can update workspace settings
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['org_admin', 'super_admin'].includes(profile.role)) {
    res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' })
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
    .eq('id', id)
    .select()
    .single()

  if (error || !data) {
    res.status(500).json({ error: 'Failed to update workspace', code: 'DB_ERROR' })
    return
  }

  res.json(data)
})

// GET /api/workspaces/:id/credits
workspacesRouter.get('/:id/credits', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params

  const { data: ledger } = await supabase
    .from('credit_ledger')
    .select('action_type, credits_used, created_at, agent_run_id')
    .eq('workspace_id', id)
    .order('created_at', { ascending: false })

  res.json({ ledger: ledger ?? [] })
})
