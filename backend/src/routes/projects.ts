import { Router, Request, Response } from 'express'
import { requireAuth, AuthedRequest } from '../middleware/auth'
import { requireWorkspaceMember, WorkspaceRequest } from '../middleware/workspace'
import { requireProjectInWorkspace, ProjectRequest } from '../middleware/project'
import { supabase } from '../lib/supabase'
import { v4 as uuidv4 } from 'uuid'

export const projectsRouter = Router({ mergeParams: true })

// GET /api/workspaces/:id/projects
projectsRouter.get('/', requireAuth, requireWorkspaceMember, async (req: Request, res: Response) => {
  const { workspace } = req as WorkspaceRequest
  const includeArchived = req.query.include_archived === 'true'

  let query = supabase
    .from('projects')
    .select('*')
    .eq('workspace_id', workspace.id)
    .order('created_at', { ascending: false })

  if (!includeArchived) {
    query = query.eq('status', 'active')
  }

  const { data, error } = await query

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
      status: 'active',
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
  requireProjectInWorkspace,
  async (req: Request, res: Response) => {
    const { project } = req as ProjectRequest

    const { data, error } = await supabase.from('projects').select('*').eq('id', project.id).single()

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
  requireProjectInWorkspace,
  async (req: Request, res: Response) => {
    const { project } = req as ProjectRequest
    const { name, description, status } = req.body

    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (status !== undefined) {
      if (!['active', 'archived'].includes(status)) {
        res.status(400).json({ error: 'Invalid status', code: 'VALIDATION_ERROR' })
        return
      }
      updates.status = status
    }

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
// Projects are the reusable-knowledge container; hard-deleting would throw
// away research/ICP/market-sizing history, which defeats the point.
projectsRouter.delete(
  '/:projectId',
  requireAuth,
  requireWorkspaceMember,
  requireProjectInWorkspace,
  async (req: Request, res: Response) => {
    const { project } = req as ProjectRequest

    const { error } = await supabase.from('projects').update({ status: 'archived' }).eq('id', project.id)

    if (error) {
      res.status(500).json({ error: 'Failed to archive project', code: 'DB_ERROR' })
      return
    }

    res.status(204).send()
  }
)
