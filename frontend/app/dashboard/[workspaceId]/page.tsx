'use client'

import { useEffect, useState } from 'react'
import { use } from 'react'
import { useRouter } from 'next/navigation'
import { api, Project } from '@/lib/api'
import { useProjectStore } from '@/store/project'
import { DashboardShell } from '@/components/dashboard/DashboardShell'

/**
 * Workspace root. If the workspace has exactly one active Project with
 * exactly one active/completed Campaign, redirects straight into the full
 * dashboard for that campaign. Otherwise renders the shell with no
 * project/campaign selected — Vimi Chat drives Project creation/selection
 * from here, and Mission Control shows only the workspace-level tabs
 * (Overview, Vault) with Project Intelligence and Campaign Execution
 * disabled until a Project (and Campaign) is picked.
 */
export default function WorkspaceDashboardPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = use(params)
  const router = useRouter()
  const { clearProject } = useProjectStore()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function checkForAutoRedirect() {
      try {
        const projects = await api.projects.list(workspaceId)
        const activeProjects = projects.filter((p: Project) => p.status === 'active')

        if (activeProjects.length === 1) {
          const campaigns = await api.campaigns.list(workspaceId, activeProjects[0].id)
          if (campaigns.length === 1) {
            if (!cancelled) {
              router.replace(
                `/dashboard/${workspaceId}/projects/${activeProjects[0].id}/campaigns/${campaigns[0].id}`
              )
            }
            return
          }
          if (campaigns.length === 0) {
            if (!cancelled) {
              router.replace(`/dashboard/${workspaceId}/projects/${activeProjects[0].id}`)
            }
            return
          }
        }
      } catch {
        // non-fatal — fall through to the project-chooser view
      }
      if (!cancelled) setChecking(false)
    }

    clearProject()
    checkForAutoRedirect()

    return () => { cancelled = true }
  }, [workspaceId, router, clearProject])

  if (checking) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex items-center gap-3 text-[#8B949E]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#30363D] border-t-[#2D7DD2]" />
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    )
  }

  return <DashboardShell workspaceId={workspaceId} projectId={null} campaignId={null} />
}
