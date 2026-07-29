import { Router, Request, Response } from 'express'
import { requireAuth, AuthedRequest } from '../middleware/auth'
import { requireWorkspaceMember } from '../middleware/workspace'
import { requireProjectInWorkspace } from '../middleware/project'
import { requireCampaignInProject, CampaignRequest } from '../middleware/campaign'
import { supabase } from '../lib/supabase'
import { param } from '../lib/params'

export const campaignOutputsRouter = Router({ mergeParams: true })

campaignOutputsRouter.use(
  requireAuth,
  requireWorkspaceMember,
  requireProjectInWorkspace,
  requireCampaignInProject
)

// GET /api/workspaces/:id/projects/:projectId/campaigns/:campaignId/playbooks
campaignOutputsRouter.get('/playbooks', async (req: Request, res: Response) => {
  const { campaign } = req as CampaignRequest

  const { data, error } = await supabase
    .from('campaign_playbooks')
    .select(
      'id, workspace_id, project_id, campaign_id, campaign_goal, channels, winning_angle, status, version, created_at, updated_at'
    )
    .eq('campaign_id', campaign.id)
    .order('created_at', { ascending: false })

  if (error) {
    res.status(500).json({ error: 'Failed to list playbooks', code: 'DB_ERROR' })
    return
  }

  res.json(data)
})

// GET /api/workspaces/:id/projects/:projectId/campaigns/:campaignId/playbooks/:pbId
campaignOutputsRouter.get('/playbooks/:pbId', async (req: Request, res: Response) => {
  const { campaign } = req as CampaignRequest
  const pbId = param(req.params.pbId)

  const { data, error } = await supabase
    .from('campaign_playbooks')
    .select('*')
    .eq('id', pbId)
    .eq('campaign_id', campaign.id)
    .single()

  if (error || !data) {
    res.status(404).json({ error: 'Playbook not found', code: 'NOT_FOUND' })
    return
  }

  res.json(data)
})

// PATCH /api/workspaces/:id/projects/:projectId/campaigns/:campaignId/playbooks/:pbId/approve
campaignOutputsRouter.patch('/playbooks/:pbId/approve', async (req: Request, res: Response) => {
  const { user } = req as AuthedRequest
  const { campaign } = req as CampaignRequest
  const pbId = param(req.params.pbId)

  const { data, error } = await supabase
    .from('campaign_playbooks')
    .update({
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', pbId)
    .eq('campaign_id', campaign.id)
    .select()
    .single()

  if (error || !data) {
    res.status(404).json({ error: 'Playbook not found', code: 'NOT_FOUND' })
    return
  }

  res.json(data)
})

// GET /api/workspaces/:id/projects/:projectId/campaigns/:campaignId/playbooks/:pbId/export
campaignOutputsRouter.get('/playbooks/:pbId/export', async (req: Request, res: Response) => {
  const { campaign } = req as CampaignRequest
  const pbId = param(req.params.pbId)
  const format = (req.query.format as string) ?? 'markdown'

  const { data, error } = await supabase
    .from('campaign_playbooks')
    .select('*')
    .eq('id', pbId)
    .eq('campaign_id', campaign.id)
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
    res.send(JSON.stringify(data.playbook_content, null, 2))
    return
  }

  res.json(data.playbook_content)
})
