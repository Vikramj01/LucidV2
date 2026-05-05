import { Request, Response, NextFunction } from 'express'
import { AuthedRequest } from './auth'
import { prisma } from '../lib/prisma'
import { param } from '../lib/params'

/**
 * Verifies the authenticated user is a member of the workspace identified
 * by `:id` in the route params. Attaches `req.workspace` for downstream use.
 *
 * Org admins and super admins pass automatically — they have cross-workspace access.
 */
export interface WorkspaceRequest extends Request {
  user: AuthedRequest['user']
  workspace: { id: string; orgId: string }
  profile: { id: string; role: string; orgId: string | null }
}

export async function requireWorkspaceMember(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { user } = req as AuthedRequest
  const workspaceId = param(req.params.id)

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { id: true, role: true, orgId: true },
  })

  if (!profile) {
    res.status(401).json({ error: 'Profile not found', code: 'AUTH_NO_PROFILE' })
    return
  }

  // Super admins have platform-wide access
  if (profile.role === 'super_admin') {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, orgId: true },
    })
    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found', code: 'NOT_FOUND' })
      return
    }
    ;(req as WorkspaceRequest).workspace = workspace
    ;(req as WorkspaceRequest).profile = profile
    next()
    return
  }

  // Org admins can access all workspaces in their org
  if (profile.role === 'org_admin') {
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, orgId: profile.orgId ?? '' },
      select: { id: true, orgId: true },
    })
    if (!workspace) {
      res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' })
      return
    }
    ;(req as WorkspaceRequest).workspace = workspace
    ;(req as WorkspaceRequest).profile = profile
    next()
    return
  }

  // Regular workspace_member — must have explicit membership
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_profileId: { workspaceId, profileId: user.id } },
    include: { workspace: { select: { id: true, orgId: true } } },
  })

  if (!membership) {
    res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' })
    return
  }

  ;(req as WorkspaceRequest).workspace = membership.workspace
  ;(req as WorkspaceRequest).profile = profile
  next()
}
