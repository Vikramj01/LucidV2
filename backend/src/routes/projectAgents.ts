import { Router, Request, Response } from 'express'
import { requireAuth, AuthedRequest } from '../middleware/auth'
import { requireWorkspaceMember, WorkspaceRequest } from '../middleware/workspace'
import { requireProjectInWorkspace, ProjectRequest } from '../middleware/project'
import { supabase } from '../lib/supabase'
import { enqueueJob } from '../lib/jobs'
import { v4 as uuidv4 } from 'uuid'

export const projectAgentsRouter = Router({ mergeParams: true })

// POST /api/workspaces/:id/projects/:projectId/agents/research/run
projectAgentsRouter.post(
  '/research/run',
  requireAuth,
  requireWorkspaceMember,
  requireProjectInWorkspace,
  async (req: Request, res: Response) => {
    const { user } = req as AuthedRequest
    const { workspace } = req as WorkspaceRequest
    const { project } = req as ProjectRequest
    const { competitor_urls, industry_keywords, research_questions } = req.body

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
        project_id: project.id,
        agent_type: 'research',
        status: 'queued',
        input_payload: {
          competitor_urls,
          industry_keywords: industry_keywords ?? '',
          research_questions: research_questions ?? [],
        },
        triggered_by: user.id,
      })
      .select()
      .single()

    if (runError || !run) {
      res.status(500).json({ error: 'Failed to create agent run', code: 'DB_ERROR' })
      return
    }

    const job_id = await enqueueJob('research_run', workspace.id, workspace.orgId, {
      agent_run_id: run_id,
      project_id: project.id,
      competitor_urls,
      industry_keywords: industry_keywords ?? '',
      research_questions: research_questions ?? [],
    })

    await supabase.from('agent_runs').update({ job_id }).eq('id', run_id)

    res.status(201).json({ ...run, job_id })
  }
)

// POST /api/workspaces/:id/projects/:projectId/agents/icp/run
projectAgentsRouter.post(
  '/icp/run',
  requireAuth,
  requireWorkspaceMember,
  requireProjectInWorkspace,
  async (req: Request, res: Response) => {
    const { user } = req as AuthedRequest
    const { workspace } = req as WorkspaceRequest
    const { project } = req as ProjectRequest
    const { research_signal_id } = req.body

    const run_id = uuidv4()

    const { data: run, error: runError } = await supabase
      .from('agent_runs')
      .insert({
        id: run_id,
        workspace_id: workspace.id,
        project_id: project.id,
        agent_type: 'icp',
        status: 'queued',
        input_payload: { research_signal_id: research_signal_id ?? null },
        triggered_by: user.id,
      })
      .select()
      .single()

    if (runError || !run) {
      res.status(500).json({ error: 'Failed to create agent run', code: 'DB_ERROR' })
      return
    }

    const job_id = await enqueueJob('icp_run', workspace.id, workspace.orgId, {
      agent_run_id: run_id,
      project_id: project.id,
      research_signal_id: research_signal_id ?? null,
    })

    await supabase.from('agent_runs').update({ job_id }).eq('id', run_id)

    res.status(201).json({ ...run, job_id })
  }
)

// POST /api/workspaces/:id/projects/:projectId/agents/market-sizing/run
projectAgentsRouter.post(
  '/market-sizing/run',
  requireAuth,
  requireWorkspaceMember,
  requireProjectInWorkspace,
  async (req: Request, res: Response) => {
    const { user } = req as AuthedRequest
    const { workspace } = req as WorkspaceRequest
    const { project } = req as ProjectRequest
    const { research_signal_id, market_data_urls } = req.body

    if (market_data_urls !== undefined && (!Array.isArray(market_data_urls) || market_data_urls.length > 5)) {
      res.status(400).json({ error: 'market_data_urls must be an array of at most 5 URLs', code: 'VALIDATION_ERROR' })
      return
    }

    const run_id = uuidv4()

    const { data: run, error: runError } = await supabase
      .from('agent_runs')
      .insert({
        id: run_id,
        workspace_id: workspace.id,
        project_id: project.id,
        agent_type: 'market_sizing',
        status: 'queued',
        input_payload: {
          research_signal_id: research_signal_id ?? null,
          market_data_urls: market_data_urls ?? [],
        },
        triggered_by: user.id,
      })
      .select()
      .single()

    if (runError || !run) {
      res.status(500).json({ error: 'Failed to create agent run', code: 'DB_ERROR' })
      return
    }

    const job_id = await enqueueJob('market_sizing_run', workspace.id, workspace.orgId, {
      agent_run_id: run_id,
      project_id: project.id,
      research_signal_id: research_signal_id ?? null,
      market_data_urls: market_data_urls ?? [],
    })

    await supabase.from('agent_runs').update({ job_id }).eq('id', run_id)

    res.status(201).json({ ...run, job_id })
  }
)

// GET /api/workspaces/:id/projects/:projectId/agents/runs
projectAgentsRouter.get(
  '/runs',
  requireAuth,
  requireWorkspaceMember,
  requireProjectInWorkspace,
  async (req: Request, res: Response) => {
    const { project } = req as ProjectRequest

    const { data, error } = await supabase
      .from('agent_runs')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      res.status(500).json({ error: 'Failed to list agent runs', code: 'DB_ERROR' })
      return
    }

    res.json(data)
  }
)
