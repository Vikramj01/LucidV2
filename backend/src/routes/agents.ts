import { Router, Request, Response } from 'express'
import { requireAuth, AuthedRequest } from '../middleware/auth'
import { requireWorkspaceMember, WorkspaceRequest } from '../middleware/workspace'
import { supabase } from '../lib/supabase'
import { enqueueJob } from '../lib/jobs'
import { v4 as uuidv4 } from 'uuid'

export const agentsRouter = Router({ mergeParams: true })

// POST /api/workspaces/:id/agents/intel/run
agentsRouter.post(
  '/intel/run',
  requireAuth,
  requireWorkspaceMember,
  async (req: Request, res: Response) => {
    const { user } = req as AuthedRequest
    const { workspace } = req as WorkspaceRequest
    const { competitor_urls, industry_keywords } = req.body

    if (!Array.isArray(competitor_urls) || competitor_urls.length === 0) {
      res.status(400).json({ error: 'competitor_urls array is required', code: 'VALIDATION_ERROR' })
      return
    }
    if (competitor_urls.length > 5) {
      res.status(400).json({ error: 'Maximum 5 competitor URLs per run', code: 'VALIDATION_ERROR' })
      return
    }

    const run_id = uuidv4()

    const { data: run, error: runError } = await supabase
      .from('agent_runs')
      .insert({
        id: run_id,
        workspace_id: workspace.id,
        agent_type: 'intel',
        status: 'queued',
        input_payload: { competitor_urls, industry_keywords: industry_keywords ?? '' },
        triggered_by: user.id,
      })
      .select()
      .single()

    if (runError || !run) {
      res.status(500).json({ error: 'Failed to create agent run', code: 'DB_ERROR' })
      return
    }

    const job_id = await enqueueJob('intel_run', workspace.id, workspace.orgId, {
      agent_run_id: run_id,
      competitor_urls,
      industry_keywords: industry_keywords ?? '',
    })

    await supabase.from('agent_runs').update({ job_id }).eq('id', run_id)

    res.status(201).json({ ...run, job_id })
  }
)

// POST /api/workspaces/:id/agents/architect/run
agentsRouter.post(
  '/architect/run',
  requireAuth,
  requireWorkspaceMember,
  async (req: Request, res: Response) => {
    const { user } = req as AuthedRequest
    const { workspace } = req as WorkspaceRequest
    const { market_signal_id, campaign_goal, channels } = req.body

    if (!campaign_goal || !Array.isArray(channels) || channels.length === 0) {
      res.status(400).json({
        error: 'campaign_goal and channels are required',
        code: 'VALIDATION_ERROR',
      })
      return
    }

    const run_id = uuidv4()

    const { data: run, error: runError } = await supabase
      .from('agent_runs')
      .insert({
        id: run_id,
        workspace_id: workspace.id,
        agent_type: 'architect',
        status: 'queued',
        input_payload: { market_signal_id, campaign_goal, channels },
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
      market_signal_id: market_signal_id ?? null,
      campaign_goal,
      channels,
    })

    await supabase.from('agent_runs').update({ job_id }).eq('id', run_id)

    res.status(201).json({ ...run, job_id })
  }
)
