import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { requireWorkspaceMember } from '../middleware/workspace'
import { requireProjectInWorkspace, ProjectRequest } from '../middleware/project'
import { supabase } from '../lib/supabase'
import { param } from '../lib/params'

export const projectOutputsRouter = Router({ mergeParams: true })

projectOutputsRouter.use(requireAuth, requireWorkspaceMember, requireProjectInWorkspace)

// GET /api/workspaces/:id/projects/:projectId/research-signals
projectOutputsRouter.get('/research-signals', async (req: Request, res: Response) => {
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
})

// GET /api/workspaces/:id/projects/:projectId/research-signals/:sigId
projectOutputsRouter.get('/research-signals/:sigId', async (req: Request, res: Response) => {
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
})

// GET /api/workspaces/:id/projects/:projectId/icp-profiles
projectOutputsRouter.get('/icp-profiles', async (req: Request, res: Response) => {
  const { project } = req as ProjectRequest

  const { data, error } = await supabase
    .from('icp_profiles')
    .select('*')
    .eq('project_id', project.id)
    .order('created_at', { ascending: false })

  if (error) {
    res.status(500).json({ error: 'Failed to list ICP profiles', code: 'DB_ERROR' })
    return
  }

  res.json(data)
})

// GET /api/workspaces/:id/projects/:projectId/icp-profiles/:icpId
projectOutputsRouter.get('/icp-profiles/:icpId', async (req: Request, res: Response) => {
  const { project } = req as ProjectRequest
  const icpId = param(req.params.icpId)

  const { data, error } = await supabase
    .from('icp_profiles')
    .select('*')
    .eq('id', icpId)
    .eq('project_id', project.id)
    .single()

  if (error || !data) {
    res.status(404).json({ error: 'ICP profile not found', code: 'NOT_FOUND' })
    return
  }

  res.json(data)
})

// GET /api/workspaces/:id/projects/:projectId/market-sizing-reports
projectOutputsRouter.get('/market-sizing-reports', async (req: Request, res: Response) => {
  const { project } = req as ProjectRequest

  const { data, error } = await supabase
    .from('market_sizing_reports')
    .select('*')
    .eq('project_id', project.id)
    .order('created_at', { ascending: false })

  if (error) {
    res.status(500).json({ error: 'Failed to list market sizing reports', code: 'DB_ERROR' })
    return
  }

  res.json(data)
})

// GET /api/workspaces/:id/projects/:projectId/market-sizing-reports/:reportId
projectOutputsRouter.get('/market-sizing-reports/:reportId', async (req: Request, res: Response) => {
  const { project } = req as ProjectRequest
  const reportId = param(req.params.reportId)

  const { data, error } = await supabase
    .from('market_sizing_reports')
    .select('*')
    .eq('id', reportId)
    .eq('project_id', project.id)
    .single()

  if (error || !data) {
    res.status(404).json({ error: 'Market sizing report not found', code: 'NOT_FOUND' })
    return
  }

  res.json(data)
})
