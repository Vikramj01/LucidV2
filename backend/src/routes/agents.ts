import { Router, Request, Response } from 'express'
import { requireAuth, AuthedRequest } from '../middleware/auth'
import { supabase } from '../lib/supabase'
import { enqueueJob } from '../lib/jobs'
import { param } from '../lib/params'
import { v4 as uuidv4 } from 'uuid'

export const agentsRouter = Router({ mergeParams: true })

// POST /api/workspaces/:id/agents/intel/run
agentsRouter.post('/intel/run', requireAuth, async (req: Request, res: Response) => {
  const { user } = req as AuthedRequest
  const workspace_id = param(req.params.id)
  const { competitor_urls, industry_keywords } = req.body

  if (!Array.isArray(competitor_urls) || competitor_urls.length === 0) {
    res.status(400).json({ error: 'competitor_urls array is required', code: 'VALIDATION_ERROR' })
    return
  }
  if (competitor_urls.length > 5) {
    res.status(400).json({ error: 'Maximum 5 competitor URLs per run', code: 'VALIDATION_ERROR' })
    return
  }

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('org_id')
    .eq('id', workspace_id)
    .single()

  if (!workspace) {
    res.status(404).json({ error: 'Workspace not found', code: 'NOT_FOUND' })
    return
  }

  const run_id = uuidv4()

  const { data: run, error: runError } = await supabase
    .from('agent_runs')
    .insert({
      id: run_id,
      workspace_id,
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

  const job_id = await enqueueJob('intel_run', workspace_id, param(workspace.org_id), {
    agent_run_id: run_id,
    competitor_urls,
    industry_keywords: industry_keywords ?? '',
  })

  // Store job_id on the run record
  await supabase.from('agent_runs').update({ job_id }).eq('id', run_id)

  res.status(201).json({ ...run, job_id })
})

// POST /api/workspaces/:id/agents/architect/run
agentsRouter.post('/architect/run', requireAuth, async (req: Request, res: Response) => {
  const { user } = req as AuthedRequest
  const workspace_id = param(req.params.id)
  const { market_signal_id, campaign_goal, channels } = req.body

  if (!campaign_goal || !Array.isArray(channels) || channels.length === 0) {
    res.status(400).json({
      error: 'campaign_goal and channels are required',
      code: 'VALIDATION_ERROR',
    })
    return
  }

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('org_id')
    .eq('id', workspace_id)
    .single()

  if (!workspace) {
    res.status(404).json({ error: 'Workspace not found', code: 'NOT_FOUND' })
    return
  }

  const run_id = uuidv4()

  const { data: run, error: runError } = await supabase
    .from('agent_runs')
    .insert({
      id: run_id,
      workspace_id,
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

  const job_id = await enqueueJob('architect_run', workspace_id, param(workspace.org_id), {
    agent_run_id: run_id,
    market_signal_id: market_signal_id ?? null,
    campaign_goal,
    channels,
  })

  await supabase.from('agent_runs').update({ job_id }).eq('id', run_id)

  res.status(201).json({ ...run, job_id })
})

// GET /api/workspaces/:id/agent-runs
agentsRouter.get('/runs', requireAuth, async (req: Request, res: Response) => {
  const workspace_id = param(req.params.id)

  const { data, error } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('workspace_id', workspace_id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    res.status(500).json({ error: 'Failed to list agent runs', code: 'DB_ERROR' })
    return
  }

  res.json(data)
})

// GET /api/workspaces/:id/agent-runs/:runId
agentsRouter.get('/runs/:runId', requireAuth, async (req: Request, res: Response) => {
  const workspace_id = param(req.params.id)
  const runId = param(req.params.runId)

  const { data, error } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('id', runId)
    .eq('workspace_id', workspace_id)
    .single()

  if (error || !data) {
    res.status(404).json({ error: 'Agent run not found', code: 'NOT_FOUND' })
    return
  }

  res.json(data)
})
