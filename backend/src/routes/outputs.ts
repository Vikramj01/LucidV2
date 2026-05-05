import { Router, Request, Response } from 'express'
import { requireAuth, AuthedRequest } from '../middleware/auth'
import { supabase } from '../lib/supabase'

export const outputsRouter = Router({ mergeParams: true })

// GET /api/workspaces/:id/market-signals
outputsRouter.get('/market-signals', requireAuth, async (req: Request, res: Response) => {
  const { id: workspace_id } = req.params

  const { data, error } = await supabase
    .from('market_signals')
    .select('*')
    .eq('workspace_id', workspace_id)
    .order('created_at', { ascending: false })

  if (error) {
    res.status(500).json({ error: 'Failed to list market signals', code: 'DB_ERROR' })
    return
  }

  res.json(data)
})

// GET /api/workspaces/:id/market-signals/:sigId
outputsRouter.get('/market-signals/:sigId', requireAuth, async (req: Request, res: Response) => {
  const { id: workspace_id, sigId } = req.params

  const { data, error } = await supabase
    .from('market_signals')
    .select('*')
    .eq('id', sigId)
    .eq('workspace_id', workspace_id)
    .single()

  if (error || !data) {
    res.status(404).json({ error: 'Market signal not found', code: 'NOT_FOUND' })
    return
  }

  res.json(data)
})

// GET /api/workspaces/:id/playbooks
outputsRouter.get('/playbooks', requireAuth, async (req: Request, res: Response) => {
  const { id: workspace_id } = req.params

  const { data, error } = await supabase
    .from('campaign_playbooks')
    .select('id, workspace_id, campaign_goal, channels, winning_angle, status, version, created_at, updated_at')
    .eq('workspace_id', workspace_id)
    .order('created_at', { ascending: false })

  if (error) {
    res.status(500).json({ error: 'Failed to list playbooks', code: 'DB_ERROR' })
    return
  }

  res.json(data)
})

// GET /api/workspaces/:id/playbooks/:pbId
outputsRouter.get('/playbooks/:pbId', requireAuth, async (req: Request, res: Response) => {
  const { id: workspace_id, pbId } = req.params

  const { data, error } = await supabase
    .from('campaign_playbooks')
    .select('*')
    .eq('id', pbId)
    .eq('workspace_id', workspace_id)
    .single()

  if (error || !data) {
    res.status(404).json({ error: 'Playbook not found', code: 'NOT_FOUND' })
    return
  }

  res.json(data)
})

// PATCH /api/workspaces/:id/playbooks/:pbId/approve
outputsRouter.patch('/playbooks/:pbId/approve', requireAuth, async (req: Request, res: Response) => {
  const { user } = req as AuthedRequest
  const { id: workspace_id, pbId } = req.params

  const { data, error } = await supabase
    .from('campaign_playbooks')
    .update({
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', pbId)
    .eq('workspace_id', workspace_id)
    .select()
    .single()

  if (error || !data) {
    res.status(404).json({ error: 'Playbook not found', code: 'NOT_FOUND' })
    return
  }

  res.json(data)
})

// GET /api/workspaces/:id/playbooks/:pbId/export
outputsRouter.get('/playbooks/:pbId/export', requireAuth, async (req: Request, res: Response) => {
  const { id: workspace_id, pbId } = req.params
  const format = (req.query.format as string) ?? 'markdown'

  const { data, error } = await supabase
    .from('campaign_playbooks')
    .select('*')
    .eq('id', pbId)
    .eq('workspace_id', workspace_id)
    .single()

  if (error || !data) {
    res.status(404).json({ error: 'Playbook not found', code: 'NOT_FOUND' })
    return
  }

  if (data.status !== 'approved') {
    res.status(403).json({ error: 'Playbook must be approved before export', code: 'NOT_APPROVED' })
    return
  }

  if (format === 'markdown') {
    res.setHeader('Content-Type', 'text/markdown')
    res.setHeader('Content-Disposition', `attachment; filename="playbook-${pbId}.md"`)
    // PDF generation handled in Sprint 7; return raw content for now
    res.send(JSON.stringify(data.playbook_content, null, 2))
    return
  }

  // JSON fallback
  res.json(data.playbook_content)
})
