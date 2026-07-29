import { Request, Response, NextFunction } from 'express'
import { ProjectRequest } from './project'
import { prisma } from '../lib/prisma'
import { param } from '../lib/params'

/**
 * Verifies the Campaign identified by `:campaignId` belongs to the Project
 * already resolved by requireProjectInWorkspace (must run first). Attaches
 * `req.campaign` for downstream use.
 */
export interface CampaignRequest extends ProjectRequest {
  campaign: {
    id: string
    projectId: string
    workspaceId: string
    campaignGoal: string
    channels: string[]
  }
}

export async function requireCampaignInProject(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { project } = req as ProjectRequest
  const campaignId = param(req.params.campaignId)

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, projectId: project.id },
    select: { id: true, projectId: true, workspaceId: true, campaignGoal: true, channels: true },
  })

  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found', code: 'NOT_FOUND' })
    return
  }

  ;(req as CampaignRequest).campaign = campaign
  next()
}
