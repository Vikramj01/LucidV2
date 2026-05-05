'use client'

import Link from 'next/link'
import { useWorkspaceStore } from '@/store/workspace'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function TopBar() {
  const { workspaceName, workspaceId, orgName, clear } = useWorkspaceStore()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    clear()
    router.push('/login')
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-[#30363D] bg-[#0D1117] px-6 shrink-0">
      <div className="flex items-center gap-3">
        {/* Logo mark */}
        <Link href="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="h-6 w-6 rounded bg-[#2D7DD2]" />
          <span className="text-sm font-semibold text-[#E6EDF3]">Lucid</span>
        </Link>
        {workspaceName && workspaceId && (
          <>
            <span className="text-[#30363D]">/</span>
            <Link
              href={`/dashboard/${workspaceId}`}
              className="text-sm text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
            >
              {workspaceName}
            </Link>
          </>
        )}
      </div>

      <nav className="flex items-center gap-4">
        {workspaceId && (
          <Link
            href={`/dashboard/${workspaceId}/credits`}
            className="text-xs text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
          >
            Credits
          </Link>
        )}
        {orgName && (
          <span className="text-xs text-[#484F58]">{orgName}</span>
        )}
        <button
          onClick={handleSignOut}
          className="text-xs text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
        >
          Sign out
        </button>
      </nav>
    </header>
  )
}
