import { Router, Request, Response } from 'express'
import { requireAuth, AuthedRequest } from '../middleware/auth'
import { requireWorkspaceMember, WorkspaceRequest } from '../middleware/workspace'
import { requireProjectInWorkspace, ProjectRequest } from '../middleware/project'
import { requireCampaignInProject, CampaignRequest } from '../middleware/campaign'
import { supabase } from '../lib/supabase'
import { enqueueJob } from '../lib/jobs'
import { v4 as uuidv4 } from 'uuid'

export const campaignAgentsRouter = Router({ mergeParams: true })

// POST /api/workspaces/:id/projects/:projectId/campaigns/:campaignId/agents/architect/run
// Goal/channels come from the Campaign row itself (set at creation), not the request body.
campaignAgentsRouter.post(
  '/architect/run',
  requireAuth,
  requireWorkspaceMember,
  requireProjectInWorkspace,
  requireCampaignInProject,
  async (req: Request, res: Response) => {
    const { user } = req as AuthedRequest
    const { workspace } = req as WorkspaceRequest
    const { project } = req as ProjectRequest
    const { campaign } = req as CampaignRequest
    const { research_signal_id, icp_profile_id, market_sizing_report_id } = req.body

    const run_id = uuidv4()

    const { data: run, error: runError } = await supabase
      .from('agent_runs')
      .insert({
        id: run_id,
        workspace_id: workspace.id,
        project_id: project.id,
        campaign_id: campaign.id,
        agent_type: 'architect',
        status: 'queued',
        input_payload: {
          research_signal_id: research_signal_id ?? null,
          icp_profile_id: icp_profile_id ?? null,
          market_sizing_report_id: market_sizing_report_id ?? null,
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
      project_id: project.id,
      campaign_id: campaign.id,
      research_signal_id: research_signal_id ?? null,
      icp_profile_id: icp_profile_id ?? null,
      market_sizing_report_id: market_sizing_report_id ?? null,
      campaign_goal: campaign.campaignGoal,
      channels: campaign.channels,
    })

    await supabase.from('agent_runs').update({ job_id }).eq('id', run_id)

    res.status(201).json({ ...run, job_id })
  }
)

// GET /api/workspaces/:id/projects/:projectId/campaigns/:campaignId/agents/runs
campaignAgentsRouter.get(
  '/runs',
  requireAuth,
  requireWorkspaceMember,
  requireProjectInWorkspace,
  requireCampaignInProject,
  async (req: Request, res: Response) => {
    const { campaign } = req as CampaignRequest

    const { data, error } = await supabase
      .from('agent_runs')
      .select('*')
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      res.status(500).json({ error: 'Failed to list agent runs', code: 'DB_ERROR' })
      return
    }

    res.json(data)
  }
)
