'use client'

import { useEffect, useRef } from 'react'
import { use } from 'react'
import { useAgentStore } from '@/store/agent'
import { useChatStore } from '@/store/chat'
import { useWorkspaceStore } from '@/store/workspace'
import { createClient } from '@/lib/supabase/client'
import { MissionControlCanvas } from '@/components/mission-control/MissionControlCanvas'
import { VimiChatPanel } from '@/components/chat/VimiChatPanel'

export default function WorkspaceDashboardPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = use(params)
  const { setResearchStatus, setArchitectStatus, researchStatus, architectStatus } = useAgentStore()
  const { phase, setPhase } = useChatStore()
  const enterWorkspace = useWorkspaceStore((s) => s.enterWorkspace)
  const prevResearchStatus = useRef<string>(researchStatus)
  const prevArchitectStatus = useRef<string>(architectStatus)

  useEffect(() => {
    enterWorkspace(workspaceId)
  }, [workspaceId, enterWorkspace])

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
          if (run.agent_type === 'research') {
            setResearchStatus(run.status as 'queued' | 'running' | 'complete' | 'failed', run.id)
          } else if (run.agent_type === 'architect') {
            setArchitectStatus(run.status as 'queued' | 'running' | 'complete' | 'failed', run.id)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [workspaceId, setResearchStatus, setArchitectStatus])

  // Auto-advance chat phases on agent completion
  useEffect(() => {
    if (
      prevResearchStatus.current !== 'complete' &&
      researchStatus === 'complete' &&
      phase === 'RESEARCH_RUNNING'
    ) {
      setPhase('ARCHITECT_SETUP')
    }
    prevResearchStatus.current = researchStatus
  }, [researchStatus, phase, setPhase])

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
