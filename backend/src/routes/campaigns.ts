import { Router, Request, Response } from 'express'
import { requireAuth, AuthedRequest } from '../middleware/auth'
import { requireWorkspaceMember, WorkspaceRequest } from '../middleware/workspace'
import { requireProject, ProjectRequest } from '../middleware/project'
import { requireCampaign, CampaignRequest } from '../middleware/campaign'
import { supabase } from '../lib/supabase'
import { enqueueJob } from '../lib/jobs'
import { param } from '../lib/params'
import { v4 as uuidv4 } from 'uuid'

export const campaignsRouter = Router({ mergeParams: true })

// GET /api/workspaces/:id/projects/:projectId/campaigns
campaignsRouter.get(
  '/',
  requireAuth,
  requireWorkspaceMember,
  requireProject,
  async (req: Request, res: Response) => {
    const { project } = req as ProjectRequest

    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })

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
  requireProject,
  async (req: Request, res: Response) => {
    const { user } = req as AuthedRequest
    const { workspace } = req as WorkspaceRequest
    const { project } = req as ProjectRequest
    const { name, campaign_goal, channels } = req.body

    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name is required', code: 'VALIDATION_ERROR' })
      return
    }
    if (!campaign_goal || !Array.isArray(channels) || channels.length === 0) {
      res.status(400).json({
        error: 'campaign_goal and channels are required',
        code: 'VALIDATION_ERROR',
      })
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
  requireProject,
  requireCampaign,
  async (req: Request, res: Response) => {
    const { campaign } = req as CampaignRequest

    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaign.id)
      .single()

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
  requireProject,
  requireCampaign,
  async (req: Request, res: Response) => {
    const { campaign } = req as CampaignRequest
    const { name, campaign_goal, channels } = req.body

    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name
    if (campaign_goal !== undefined) updates.campaign_goal = campaign_goal
    if (channels !== undefined) updates.channels = channels

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

// DELETE /api/workspaces/:id/projects/:projectId/campaigns/:campaignId — soft
// delete (archive). Same rationale as Projects — no RLS DELETE policy, this
// always resolves to status = 'archived'.
campaignsRouter.delete(
  '/:campaignId',
  requireAuth,
  requireWorkspaceMember,
  requireProject,
  requireCampaign,
  async (req: Request, res: Response) => {
    const { campaign } = req as CampaignRequest

    const { data, error } = await supabase
      .from('campaigns')
      .update({ status: 'archived' })
      .eq('id', campaign.id)
      .select()
      .single()

    if (error || !data) {
      res.status(500).json({ error: 'Failed to archive campaign', code: 'DB_ERROR' })
      return
    }

    res.json(data)
  }
)

// POST /api/workspaces/:id/projects/:projectId/campaigns/:campaignId/agents/architect/run
// campaign_goal/channels come from the Campaign row itself, not the request
// body — they're fixed when the Campaign is created (PRD §4.3), not
// re-specified on every Architect run. research_signal_id is an optional
// override; when omitted, agent-service resolves the Project's latest
// Research Signal (and, once Sprint 11-13 land, ICP/Market Sizing) itself.
campaignsRouter.post(
  '/:campaignId/agents/architect/run',
  requireAuth,
  requireWorkspaceMember,
  requireProject,
  requireCampaign,
  async (req: Request, res: Response) => {
    const { user } = req as AuthedRequest
    const { workspace } = req as WorkspaceRequest
    const { campaign } = req as CampaignRequest
    const { research_signal_id } = req.body

    const run_id = uuidv4()

    const { data: run, error: runError } = await supabase
      .from('agent_runs')
      .insert({
        id: run_id,
        workspace_id: workspace.id,
        project_id: campaign.projectId,
        campaign_id: campaign.id,
        agent_type: 'architect',
        status: 'queued',
        input_payload: {
          research_signal_id: research_signal_id ?? null,
          campaign_goal: campaign.campaignGoal,
          channels: campaign.channels,
        },
        triggered_by: user.id,
      })
      .select()
      .single()

    if (runError || !run) {
      res.status(500).json({ error: 'Failed to create agent run', code: 'DB_ERROR' })
      return
    }

    const job_id = await enqueueJob('architect_run', workspace.id, workspace.orgId, {
      agent_run_id: run_id,
      project_id: campaign.projectId,
      campaign_id: campaign.id,
      research_signal_id: research_signal_id ?? null,
      campaign_goal: campaign.campaignGoal,
      channels: campaign.channels,
    })

    await supabase.from('agent_runs').update({ job_id }).eq('id', run_id)

    res.status(201).json({ ...run, job_id })
  }
)

// GET /api/workspaces/:id/projects/:projectId/campaigns/:campaignId/playbooks
campaignsRouter.get(
  '/:campaignId/playbooks',
  requireAuth,
  requireWorkspaceMember,
  requireProject,
  requireCampaign,
  async (req: Request, res: Response) => {
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
  }
)

// GET /api/workspaces/:id/projects/:projectId/campaigns/:campaignId/playbooks/:pbId
campaignsRouter.get(
  '/:campaignId/playbooks/:pbId',
  requireAuth,
  requireWorkspaceMember,
  requireProject,
  requireCampaign,
  async (req: Request, res: Response) => {
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
  }
)

// PATCH /api/workspaces/:id/projects/:projectId/campaigns/:campaignId/playbooks/:pbId/approve
campaignsRouter.patch(
  '/:campaignId/playbooks/:pbId/approve',
  requireAuth,
  requireWorkspaceMember,
  requireProject,
  requireCampaign,
  async (req: Request, res: Response) => {
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
  }
)

// GET /api/workspaces/:id/projects/:projectId/campaigns/:campaignId/playbooks/:pbId/export
campaignsRouter.get(
  '/:campaignId/playbooks/:pbId/export',
  requireAuth,
  requireWorkspaceMember,
  requireProject,
  requireCampaign,
  async (req: Request, res: Response) => {
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
