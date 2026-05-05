import { Router, Request, Response } from 'express'
import { requireAuth, AuthedRequest } from '../middleware/auth'
import { supabase } from '../lib/supabase'

export const organisationsRouter = Router()

// POST /api/organisations — create org, set caller as org_admin
organisationsRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  const { user } = req as AuthedRequest
  const { name, org_type } = req.body

  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required', code: 'VALIDATION_ERROR' })
    return
  }

  // Create organisation
  const { data: org, error: orgError } = await supabase
    .from('organisations')
    .insert({ name: name.trim(), org_type: org_type ?? 'brand' })
    .select()
    .single()

  if (orgError || !org) {
    res.status(500).json({ error: 'Failed to create organisation', code: 'DB_ERROR' })
    return
  }

  // Set caller as org_admin on their profile
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ org_id: org.id, role: 'org_admin' })
    .eq('id', user.id)

  if (profileError) {
    res.status(500).json({ error: 'Failed to set org admin', code: 'DB_ERROR' })
    return
  }

  res.status(201).json(org)
})

// GET /api/organisations/:id — get org with workspaces
organisationsRouter.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params

  const { data: org, error } = await supabase
    .from('organisations')
    .select('*, workspaces(*)')
    .eq('id', id)
    .single()

  if (error || !org) {
    res.status(404).json({ error: 'Organisation not found', code: 'NOT_FOUND' })
    return
  }

  res.json(org)
})

// POST /api/organisations/:id/workspaces — create workspace
organisationsRouter.post('/:id/workspaces', requireAuth, async (req: Request, res: Response) => {
  const { user } = req as AuthedRequest
  const { id: org_id } = req.params
  const { name, description } = req.body

  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required', code: 'VALIDATION_ERROR' })
    return
  }

  // Verify caller belongs to this org
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.org_id !== org_id || !['org_admin', 'super_admin'].includes(profile.role)) {
    res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' })
    return
  }

  // Create workspace
  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .insert({ org_id, name: name.trim(), description: description ?? null })
    .select()
    .single()

  if (wsError || !workspace) {
    res.status(500).json({ error: 'Failed to create workspace', code: 'DB_ERROR' })
    return
  }

  // Add caller as workspace member
  await supabase.from('workspace_members').insert({
    workspace_id: workspace.id,
    profile_id: user.id,
    role: 'org_admin',
  })

  res.status(201).json(workspace)
})

// GET /api/organisations/:id/credits — credit balance + usage breakdown
organisationsRouter.get('/:id/credits', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params

  const { data: org } = await supabase
    .from('organisations')
    .select('credit_balance, credit_cap')
    .eq('id', id)
    .single()

  const { data: ledger } = await supabase
    .from('credit_ledger')
    .select('workspace_id, action_type, credits_used, created_at')
    .eq('org_id', id)

  res.json({ org, ledger: ledger ?? [] })
})
