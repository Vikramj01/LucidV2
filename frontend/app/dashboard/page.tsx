'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useWorkspaceStore } from '@/store/workspace'

/**
 * Dashboard root: redirect to /dashboard/:workspaceId if a workspace is stored,
 * or to /onboarding if not yet set up.
 * Sprint 6 will replace this with the full Mission Control split-screen layout.
 */
export default function DashboardPage() {
  const router = useRouter()
  const { workspaceId } = useWorkspaceStore()

  useEffect(() => {
    if (workspaceId) {
      router.replace(`/dashboard/${workspaceId}`)
    } else {
      router.replace('/onboarding')
    }
  }, [workspaceId, router])

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex items-center gap-3 text-[#8B949E]">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#30363D] border-t-[#2D7DD2]" />
        <span className="text-sm">Loading workspace…</span>
      </div>
    </div>
  )
}
