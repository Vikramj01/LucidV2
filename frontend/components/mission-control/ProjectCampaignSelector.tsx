'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, Project, Campaign } from '@/lib/api'

/**
 * Read-only breadcrumb/switcher between existing Projects and Campaigns.
 * Deliberately has no create/delete actions — Vimi Chat is the only write
 * surface for user intent; this just navigates among what already exists.
 */
export function ProjectCampaignSelector({
  workspaceId,
  projectId,
  campaignId,
}: {
  workspaceId: string
  projectId: string | null
  campaignId: string | null
}) {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])

  useEffect(() => {
    api.projects.list(workspaceId).then(setProjects).catch(() => {})
  }, [workspaceId])

  useEffect(() => {
    if (!projectId) {
      setCampaigns([])
      return
    }
    api.campaigns.list(workspaceId, projectId).then(setCampaigns).catch(() => {})
  }, [workspaceId, projectId])

  function handleProjectChange(newProjectId: string) {
    if (!newProjectId) {
      router.push(`/dashboard/${workspaceId}`)
      return
    }
    router.push(`/dashboard/${workspaceId}/projects/${newProjectId}`)
  }

  function handleCampaignChange(newCampaignId: string) {
    if (!projectId) return
    if (!newCampaignId) {
      router.push(`/dashboard/${workspaceId}/projects/${projectId}`)
      return
    }
    router.push(`/dashboard/${workspaceId}/projects/${projectId}/campaigns/${newCampaignId}`)
  }

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <select
        value={projectId ?? ''}
        onChange={(e) => handleProjectChange(e.target.value)}
        className="max-w-[160px] truncate rounded-md border border-[#30363D] bg-[#161B22] px-2 py-1 text-[#E6EDF3] focus:outline-none focus:border-[#388BFD]"
      >
        <option value="">Select project…</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      {projectId && (
        <>
          <span className="text-[#30363D]">/</span>
          <select
            value={campaignId ?? ''}
            onChange={(e) => handleCampaignChange(e.target.value)}
            disabled={campaigns.length === 0}
            className="max-w-[160px] truncate rounded-md border border-[#30363D] bg-[#161B22] px-2 py-1 text-[#E6EDF3] focus:outline-none focus:border-[#388BFD] disabled:opacity-40"
          >
            <option value="">Select campaign…</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </>
      )}
    </div>
  )
}
