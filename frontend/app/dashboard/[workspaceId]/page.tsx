'use client'

import { useEffect } from 'react'
import { use } from 'react'
import { useWorkspaceStore } from '@/store/workspace'
import { useAgentStore } from '@/store/agent'
import { createClient } from '@/lib/supabase/client'

/**
 * Workspace dashboard — placeholder for Sprint 6 Mission Control canvas.
 * Wires up Supabase Realtime subscriptions for agent_runs so the agent
 * store stays live even before the full UI is built.
 */
export default function WorkspaceDashboardPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = use(params)
  const { workspaceName } = useWorkspaceStore()
  const { setIntelStatus, setArchitectStatus } = useAgentStore()

  // Subscribe to agent_runs Realtime for this workspace
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`agent_runs:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_runs',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const run = payload.new as {
            agent_type: string
            status: string
            id: string
          }
          if (run.agent_type === 'intel') {
            setIntelStatus(run.status as 'queued' | 'running' | 'complete' | 'failed', run.id)
          } else if (run.agent_type === 'architect') {
            setArchitectStatus(run.status as 'queued' | 'running' | 'complete' | 'failed', run.id)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [workspaceId, setIntelStatus, setArchitectStatus])

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center px-8">
      <div>
        <h2 className="text-xl font-semibold text-[#E6EDF3]">
          {workspaceName ?? 'Your workspace'} is ready
        </h2>
        <p className="mt-2 text-sm text-[#8B949E] max-w-md">
          Mission Control and the Vimi Chat Panel are coming in Sprint 6.
          The agent pipeline, vault ingestion, and all API routes are live.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        {[
          { label: 'Intel Agent', status: 'Ready', color: 'text-[#3FB950]' },
          { label: 'Architect Agent', status: 'Ready', color: 'text-[#3FB950]' },
          { label: 'Brand Voice Vault', status: 'Ready', color: 'text-[#3FB950]' },
          { label: 'Redis Queue', status: 'Ready', color: 'text-[#3FB950]' },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-[#30363D] bg-[#161B22] px-4 py-3 text-left"
          >
            <p className="text-xs text-[#8B949E]">{item.label}</p>
            <p className={`text-sm font-medium mt-0.5 ${item.color}`}>{item.status}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-[#484F58]">Workspace ID: {workspaceId}</p>
    </div>
  )
}
