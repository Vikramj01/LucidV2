'use client'

import { useEffect, useRef } from 'react'
import { use } from 'react'
import { useAgentStore } from '@/store/agent'
import { useChatStore } from '@/store/chat'
import { createClient } from '@/lib/supabase/client'
import { MissionControlCanvas } from '@/components/mission-control/MissionControlCanvas'
import { VimiChatPanel } from '@/components/chat/VimiChatPanel'

export default function WorkspaceDashboardPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = use(params)
  const { setIntelStatus, setArchitectStatus, intelStatus, architectStatus } = useAgentStore()
  const { phase, setPhase } = useChatStore()
  const prevIntelStatus = useRef<string>(intelStatus)
  const prevArchitectStatus = useRef<string>(architectStatus)

  // Realtime: subscribe to agent_runs changes for this workspace
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

    return () => { supabase.removeChannel(channel) }
  }, [workspaceId, setIntelStatus, setArchitectStatus])

  // Auto-advance chat phases on agent completion
  useEffect(() => {
    if (
      prevIntelStatus.current !== 'complete' &&
      intelStatus === 'complete' &&
      phase === 'INTEL_RUNNING'
    ) {
      setPhase('ARCHITECT_SETUP')
    }
    prevIntelStatus.current = intelStatus
  }, [intelStatus, phase, setPhase])

  useEffect(() => {
    if (
      prevArchitectStatus.current !== 'complete' &&
      architectStatus === 'complete' &&
      phase === 'ARCHITECT_RUNNING'
    ) {
      setPhase('ACTIVE')
    }
    prevArchitectStatus.current = architectStatus
  }, [architectStatus, phase, setPhase])

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left 40% — Vimi Chat Panel */}
      <div className="w-[40%] flex flex-col border-r border-[#30363D] overflow-hidden shrink-0">
        <VimiChatPanel workspaceId={workspaceId} />
      </div>

      {/* Right 60% — Mission Control Canvas */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <MissionControlCanvas workspaceId={workspaceId} />
      </div>
    </div>
  )
}
