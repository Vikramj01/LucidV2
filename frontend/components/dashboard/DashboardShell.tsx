'use client'

import { useEffect, useRef } from 'react'
import { useAgentStore, AgentStatus } from '@/store/agent'
import { useChatStore } from '@/store/chat'
import { createClient } from '@/lib/supabase/client'
import { MissionControlCanvas } from '@/components/mission-control/MissionControlCanvas'
import { VimiChatPanel } from '@/components/chat/VimiChatPanel'

interface DashboardShellProps {
  workspaceId: string
  projectId: string | null
  campaignId: string | null
}

/**
 * The split-screen shell (Vimi Chat + Mission Control), shared across all
 * three route levels (workspace / project / campaign). projectId/campaignId
 * are null until the corresponding entity is selected — Mission Control and
 * Vimi Chat both handle that by disabling the tabs/phases that need them.
 */
export function DashboardShell({ workspaceId, projectId, campaignId }: DashboardShellProps) {
  const {
    researchStatus, icpStatus, marketSizingStatus, architectStatus,
    setResearchStatus, setIcpStatus, setMarketSizingStatus, setArchitectStatus,
  } = useAgentStore()
  const { phase, setPhase } = useChatStore()

  const prevResearch = useRef(researchStatus)
  const prevIcp = useRef(icpStatus)
  const prevMarketSizing = useRef(marketSizingStatus)
  const prevArchitect = useRef(architectStatus)

  // Realtime: subscribe to agent_runs changes for this workspace, filtered
  // client-side by the currently selected project/campaign — the channel
  // itself is only workspace-scoped, so without this a run in a different
  // project/campaign under the same workspace would still update these
  // status badges.
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
            status: AgentStatus
            id: string
            project_id: string | null
            campaign_id: string | null
          }

          if (run.agent_type === 'architect') {
            if (!campaignId || run.campaign_id !== campaignId) return
            setArchitectStatus(run.status, run.id)
            return
          }
          if (['research', 'icp', 'market_sizing'].includes(run.agent_type)) {
            if (!projectId || run.project_id !== projectId) return
            if (run.agent_type === 'research') setResearchStatus(run.status, run.id)
            else if (run.agent_type === 'icp') setIcpStatus(run.status, run.id)
            else setMarketSizingStatus(run.status, run.id)
          }
          // vault_ingest/builder/analyst runs aren't tracked in this store
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [workspaceId, projectId, campaignId, setResearchStatus, setIcpStatus, setMarketSizingStatus, setArchitectStatus])

  // Auto-advance chat phases on agent completion
  useEffect(() => {
    if (prevResearch.current !== 'complete' && researchStatus === 'complete' && phase === 'RESEARCH_RUNNING') {
      setPhase('ICP_SETUP')
    }
    prevResearch.current = researchStatus
  }, [researchStatus, phase, setPhase])

  useEffect(() => {
    if (prevIcp.current !== 'complete' && icpStatus === 'complete' && phase === 'ICP_RUNNING') {
      setPhase('MARKET_SIZING_SETUP')
    }
    prevIcp.current = icpStatus
  }, [icpStatus, phase, setPhase])

  useEffect(() => {
    if (prevMarketSizing.current !== 'complete' && marketSizingStatus === 'complete' && phase === 'MARKET_SIZING_RUNNING') {
      setPhase('CAMPAIGN_CREATE')
    }
    prevMarketSizing.current = marketSizingStatus
  }, [marketSizingStatus, phase, setPhase])

  useEffect(() => {
    if (prevArchitect.current !== 'complete' && architectStatus === 'complete' && phase === 'ARCHITECT_RUNNING') {
      setPhase('ACTIVE')
    }
    prevArchitect.current = architectStatus
  }, [architectStatus, phase, setPhase])

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left 40% — Vimi Chat Panel */}
      <div className="w-[40%] flex flex-col border-r border-[#30363D] overflow-hidden shrink-0">
        <VimiChatPanel workspaceId={workspaceId} projectId={projectId} campaignId={campaignId} />
      </div>

      {/* Right 60% — Mission Control Canvas */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <MissionControlCanvas workspaceId={workspaceId} projectId={projectId} campaignId={campaignId} />
      </div>
    </div>
  )
}
