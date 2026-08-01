'use client'

import { useEffect } from 'react'
import { use } from 'react'
import { useProjectStore } from '@/store/project'
import { api } from '@/lib/api'
import { DashboardShell } from '@/components/dashboard/DashboardShell'

/**
 * Full split-screen dashboard — Project and Campaign both selected.
 * Project Intelligence and Campaign Execution tabs are both live.
 */
export default function CampaignDashboardPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string; campaignId: string }>
}) {
  const { workspaceId, projectId, campaignId } = use(params)
  const { setProject, setCampaign } = useProjectStore()

  useEffect(() => {
    let cancelled = false

    // Sequential, not parallel: setProject() also resets campaignId/campaignName
    // (correct when the user navigates to a different project, wrong here) — if
    // setProject resolved after setCampaign due to network timing, it would wipe
    // out the campaign selection this effect just set.
    async function hydrate() {
      try {
        const project = await api.projects.get(workspaceId, projectId)
        if (cancelled) return
        setProject({ id: project.id, name: project.name })

        const campaign = await api.campaigns.get(workspaceId, projectId, campaignId)
        if (cancelled) return
        setCampaign({ id: campaign.id, name: campaign.name })
      } catch {
        // non-fatal — DashboardShell still works with the ids from the route
      }
    }

    hydrate()
    return () => { cancelled = true }
  }, [workspaceId, projectId, campaignId, setProject, setCampaign])

  return <DashboardShell workspaceId={workspaceId} projectId={projectId} campaignId={campaignId} />
}
