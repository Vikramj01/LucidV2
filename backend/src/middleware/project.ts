import { Request, Response, NextFunction } from 'express'
import { WorkspaceRequest } from './workspace'
import { prisma } from '../lib/prisma'
import { param } from '../lib/params'

/**
 * Verifies the Project identified by `:projectId` belongs to the Workspace
 * already resolved by requireWorkspaceMember (must run first). Attaches
 * `req.project` for downstream use.
 */
export interface ProjectRequest extends WorkspaceRequest {
  project: { id: string; workspaceId: string }
}

export async function requireProjectInWorkspace(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { workspace } = req as WorkspaceRequest
  const projectId = param(req.params.projectId)

  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId: workspace.id },
    select: { id: true, workspaceId: true },
  })

  if (!project) {
    res.status(404).json({ error: 'Project not found', code: 'NOT_FOUND' })
    return
  }

  ;(req as ProjectRequest).project = project
  next()
}
