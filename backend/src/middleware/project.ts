import { Request, Response, NextFunction } from 'express'
import { WorkspaceRequest } from './workspace'
import { prisma } from '../lib/prisma'
import { param } from '../lib/params'

/**
 * Verifies :projectId in the route params belongs to the workspace already
 * resolved by requireWorkspaceMember. Attaches req.project for downstream use.
 */
export interface ProjectRequest extends WorkspaceRequest {
  project: { id: string; workspaceId: string; status: string }
}

export async function requireProject(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { workspace } = req as WorkspaceRequest
  const projectId = param(req.params.projectId)

  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId: workspace.id },
    select: { id: true, workspaceId: true, status: true },
  })

  if (!project) {
    res.status(404).json({ error: 'Project not found', code: 'NOT_FOUND' })
    return
  }

  ;(req as ProjectRequest).project = project
  next()
}
