import { Request, Response, NextFunction } from 'express'
import { ProjectRequest } from './project'
import { prisma } from '../lib/prisma'
import { param } from '../lib/params'

/**
 * Verifies :campaignId in the route params belongs to the project already
 * resolved by requireProject. Attaches req.campaign for downstream use —
 * including campaignGoal/channels, which the Architect trigger route reads
 * from the Campaign itself rather than accepting fresh in the trigger body
 * (they're set once at Campaign creation, per PRD §4.3).
 */
export interface CampaignRequest extends ProjectRequest {
  campaign: {
    id: string
    workspaceId: string
    projectId: string
    campaignGoal: string
    channels: string[]
    status: string
  }
}

export async function requireCampaign(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { project } = req as ProjectRequest
  const campaignId = param(req.params.campaignId)

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, projectId: project.id },
    select: {
      id: true,
      workspaceId: true,
      projectId: true,
      campaignGoal: true,
      channels: true,
      status: true,
    },
  })

  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found', code: 'NOT_FOUND' })
    return
  }

  ;(req as CampaignRequest).campaign = campaign
  next()
}
