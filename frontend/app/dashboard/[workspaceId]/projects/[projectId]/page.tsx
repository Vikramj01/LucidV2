'use client'

import { useEffect } from 'react'
import { use } from 'react'
import { useProjectStore } from '@/store/project'
import { api } from '@/lib/api'
import { DashboardShell } from '@/components/dashboard/DashboardShell'

/**
 * Project selected, no Campaign yet. Project Intelligence tabs (Research,
 * ICP, Market Sizing) are live; Campaign Execution stays disabled until a
 * Campaign is created or selected.
 */
export default function ProjectDashboardPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>
}) {
  const { workspaceId, projectId } = use(params)
  const { setProject } = useProjectStore()

  useEffect(() => {
    let cancelled = false
    api.projects.get(workspaceId, projectId)
      .then((project) => {
        if (!cancelled) setProject({ id: project.id, name: project.name })
      })
      .catch(() => {
        // non-fatal — DashboardShell/MissionControlCanvas still work with
        // just the projectId; the name falls back to what's in the store.
      })
    return () => { cancelled = true }
  }, [workspaceId, projectId, setProject])

  return <DashboardShell workspaceId={workspaceId} projectId={projectId} campaignId={null} />
}
