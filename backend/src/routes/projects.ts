import { Router, Request, Response } from 'express'
import { requireAuth, AuthedRequest } from '../middleware/auth'
import { requireWorkspaceMember, WorkspaceRequest } from '../middleware/workspace'
import { requireProject, ProjectRequest } from '../middleware/project'
import { supabase } from '../lib/supabase'
import { enqueueJob } from '../lib/jobs'
import { param } from '../lib/params'
import { v4 as uuidv4 } from 'uuid'

export const projectsRouter = Router({ mergeParams: true })

// GET /api/workspaces/:id/projects
projectsRouter.get('/', requireAuth, requireWorkspaceMember, async (req: Request, res: Response) => {
  const { workspace } = req as WorkspaceRequest

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('workspace_id', workspace.id)
    .order('created_at', { ascending: false })

  if (error) {
    res.status(500).json({ error: 'Failed to list projects', code: 'DB_ERROR' })
    return
  }

  res.json(data)
})

// POST /api/workspaces/:id/projects
projectsRouter.post('/', requireAuth, requireWorkspaceMember, async (req: Request, res: Response) => {
  const { user } = req as AuthedRequest
  const { workspace } = req as WorkspaceRequest
  const { name, description } = req.body

  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required', code: 'VALIDATION_ERROR' })
    return
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({
      id: uuidv4(),
      workspace_id: workspace.id,
      name: name.trim(),
      description: description ?? null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error || !data) {
    res.status(500).json({ error: 'Failed to create project', code: 'DB_ERROR' })
    return
  }

  res.status(201).json(data)
})

// GET /api/workspaces/:id/projects/:projectId
projectsRouter.get(
  '/:projectId',
  requireAuth,
  requireWorkspaceMember,
  requireProject,
  async (req: Request, res: Response) => {
    const { project } = req as ProjectRequest

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', project.id)
      .single()

    if (error || !data) {
      res.status(404).json({ error: 'Project not found', code: 'NOT_FOUND' })
      return
    }

    res.json(data)
  }
)

// PATCH /api/workspaces/:id/projects/:projectId
projectsRouter.patch(
  '/:projectId',
  requireAuth,
  requireWorkspaceMember,
  requireProject,
  async (req: Request, res: Response) => {
    const { project } = req as ProjectRequest
    const { name, description } = req.body

    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description

    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', project.id)
      .select()
      .single()

    if (error || !data) {
      res.status(500).json({ error: 'Failed to update project', code: 'DB_ERROR' })
      return
    }

    res.json(data)
  }
)

// DELETE /api/workspaces/:id/projects/:projectId — soft delete (archive).
// Projects have no RLS DELETE policy by design (PRD §4.3): the whole point
// of this layer is not losing institutional knowledge, so this always
// resolves to status = 'archived', never a real row delete.
projectsRouter.delete(
  '/:projectId',
  requireAuth,
  requireWorkspaceMember,
  requireProject,
  async (req: Request, res: Response) => {
    const { project } = req as ProjectRequest

    const { data, error } = await supabase
      .from('projects')
      .update({ status: 'archived' })
      .eq('id', project.id)
      .select()
      .single()

    if (error || !data) {
      res.status(500).json({ error: 'Failed to archive project', code: 'DB_ERROR' })
      return
    }

    res.json(data)
  }
)

// POST /api/workspaces/:id/projects/:projectId/agents/research/run
// (renamed + moved from the old flat /agents/intel/run — Research is now
// triggered at the Project level so its output is reusable across every
// Campaign underneath it)
projectsRouter.post(
  '/:projectId/agents/research/run',
  requireAuth,
  requireWorkspaceMember,
  requireProject,
  async (req: Request, res: Response) => {
    const { user } = req as AuthedRequest
    const { workspace } = req as WorkspaceRequest
    const { project } = req as ProjectRequest
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
        project_id: project.id,
        agent_type: 'research',
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

    const job_id = await enqueueJob('research_run', workspace.id, workspace.orgId, {
      agent_run_id: run_id,
      project_id: project.id,
      competitor_urls,
      industry_keywords: industry_keywords ?? '',
    })

    await supabase.from('agent_runs').update({ job_id }).eq('id', run_id)

    res.status(201).json({ ...run, job_id })
  }
)

// GET /api/workspaces/:id/projects/:projectId/research-signals
projectsRouter.get(
  '/:projectId/research-signals',
  requireAuth,
  requireWorkspaceMember,
  requireProject,
  async (req: Request, res: Response) => {
    const { project } = req as ProjectRequest

    const { data, error } = await supabase
      .from('research_signals')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })

    if (error) {
      res.status(500).json({ error: 'Failed to list research signals', code: 'DB_ERROR' })
      return
    }

    res.json(data)
  }
)

// GET /api/workspaces/:id/projects/:projectId/research-signals/:sigId
projectsRouter.get(
  '/:projectId/research-signals/:sigId',
  requireAuth,
  requireWorkspaceMember,
  requireProject,
  async (req: Request, res: Response) => {
    const { project } = req as ProjectRequest
    const sigId = param(req.params.sigId)

    const { data, error } = await supabase
      .from('research_signals')
      .select('*')
      .eq('id', sigId)
      .eq('project_id', project.id)
      .single()

    if (error || !data) {
      res.status(404).json({ error: 'Research signal not found', code: 'NOT_FOUND' })
      return
    }

    res.json(data)
  }
)
