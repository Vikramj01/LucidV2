import { Router, Request, Response } from 'express'
import { requireAuth, AuthedRequest } from '../middleware/auth'
import { requireWorkspaceMember, WorkspaceRequest } from '../middleware/workspace'
import { requireProjectInWorkspace, ProjectRequest } from '../middleware/project'
import { requireCampaignInProject, CampaignRequest } from '../middleware/campaign'
import { supabase } from '../lib/supabase'
import { v4 as uuidv4 } from 'uuid'

export const campaignsRouter = Router({ mergeParams: true })

const CAMPAIGN_GOALS = ['awareness', 'leads', 'pipeline', 'retention']
const CAMPAIGN_CHANNELS = ['linkedin', 'google_search', 'google_display', 'meta', 'email']

// GET /api/workspaces/:id/projects/:projectId/campaigns
campaignsRouter.get(
  '/',
  requireAuth,
  requireWorkspaceMember,
  requireProjectInWorkspace,
  async (req: Request, res: Response) => {
    const { project } = req as ProjectRequest
    const includeArchived = req.query.include_archived === 'true'

    let query = supabase
      .from('campaigns')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })

    if (!includeArchived) {
      query = query.in('status', ['active', 'completed'])
    }

    const { data, error } = await query

    if (error) {
      res.status(500).json({ error: 'Failed to list campaigns', code: 'DB_ERROR' })
      return
    }

    res.json(data)
  }
)

// POST /api/workspaces/:id/projects/:projectId/campaigns
campaignsRouter.post(
  '/',
  requireAuth,
  requireWorkspaceMember,
  requireProjectInWorkspace,
  async (req: Request, res: Response) => {
    const { user } = req as AuthedRequest
    const { workspace } = req as WorkspaceRequest
    const { project } = req as ProjectRequest
    const { name, campaign_goal, channels } = req.body

    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name is required', code: 'VALIDATION_ERROR' })
      return
    }
    if (!CAMPAIGN_GOALS.includes(campaign_goal)) {
      res.status(400).json({ error: 'Invalid campaign_goal', code: 'VALIDATION_ERROR' })
      return
    }
    if (!Array.isArray(channels) || channels.length === 0 || !channels.every((c) => CAMPAIGN_CHANNELS.includes(c))) {
      res.status(400).json({ error: 'channels must be a non-empty array of valid channels', code: 'VALIDATION_ERROR' })
      return
    }

    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        id: uuidv4(),
        workspace_id: workspace.id,
        project_id: project.id,
        name: name.trim(),
        campaign_goal,
        channels,
        status: 'active',
        created_by: user.id,
      })
      .select()
      .single()

    if (error || !data) {
      res.status(500).json({ error: 'Failed to create campaign', code: 'DB_ERROR' })
      return
    }

    res.status(201).json(data)
  }
)

// GET /api/workspaces/:id/projects/:projectId/campaigns/:campaignId
campaignsRouter.get(
  '/:campaignId',
  requireAuth,
  requireWorkspaceMember,
  requireProjectInWorkspace,
  requireCampaignInProject,
  async (req: Request, res: Response) => {
    const { campaign } = req as CampaignRequest

    const { data, error } = await supabase.from('campaigns').select('*').eq('id', campaign.id).single()

    if (error || !data) {
      res.status(404).json({ error: 'Campaign not found', code: 'NOT_FOUND' })
      return
    }

    res.json(data)
  }
)

// PATCH /api/workspaces/:id/projects/:projectId/campaigns/:campaignId
campaignsRouter.patch(
  '/:campaignId',
  requireAuth,
  requireWorkspaceMember,
  requireProjectInWorkspace,
  requireCampaignInProject,
  async (req: Request, res: Response) => {
    const { campaign } = req as CampaignRequest
    const { name, campaign_goal, channels, status } = req.body

    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name
    if (campaign_goal !== undefined) {
      if (!CAMPAIGN_GOALS.includes(campaign_goal)) {
        res.status(400).json({ error: 'Invalid campaign_goal', code: 'VALIDATION_ERROR' })
        return
      }
      updates.campaign_goal = campaign_goal
    }
    if (channels !== undefined) {
      if (!Array.isArray(channels) || channels.length === 0 || !channels.every((c) => CAMPAIGN_CHANNELS.includes(c))) {
        res.status(400).json({ error: 'channels must be a non-empty array of valid channels', code: 'VALIDATION_ERROR' })
        return
      }
      updates.channels = channels
    }
    if (status !== undefined) {
      if (!['active', 'completed', 'archived'].includes(status)) {
        res.status(400).json({ error: 'Invalid status', code: 'VALIDATION_ERROR' })
        return
      }
      updates.status = status
    }

    const { data, error } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', campaign.id)
      .select()
      .single()

    if (error || !data) {
      res.status(500).json({ error: 'Failed to update campaign', code: 'DB_ERROR' })
      return
    }

    res.json(data)
  }
)

// DELETE /api/workspaces/:id/projects/:projectId/campaigns/:campaignId — soft delete (archive)
campaignsRouter.delete(
  '/:campaignId',
  requireAuth,
  requireWorkspaceMember,
  requireProjectInWorkspace,
  requireCampaignInProject,
  async (req: Request, res: Response) => {
    const { campaign } = req as CampaignRequest

    const { error } = await supabase.from('campaigns').update({ status: 'archived' }).eq('id', campaign.id)

    if (error) {
      res.status(500).json({ error: 'Failed to archive campaign', code: 'DB_ERROR' })
      return
    }

    res.status(204).send()
  }
)
