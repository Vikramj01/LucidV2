import { create } from 'zustand'

export type AgentStatus = 'idle' | 'queued' | 'running' | 'complete' | 'failed'

export interface AgentState {
  researchStatus: AgentStatus
  icpStatus: AgentStatus
  marketSizingStatus: AgentStatus
  architectStatus: AgentStatus

  researchRunId: string | null
  icpRunId: string | null
  marketSizingRunId: string | null
  architectRunId: string | null

  latestResearchSignalId: string | null
  latestIcpProfileId: string | null
  latestMarketSizingReportId: string | null
  latestPlaybookId: string | null

  setResearchStatus: (status: AgentStatus, runId?: string) => void
  setIcpStatus: (status: AgentStatus, runId?: string) => void
  setMarketSizingStatus: (status: AgentStatus, runId?: string) => void
  setArchitectStatus: (status: AgentStatus, runId?: string) => void

  setLatestResearchSignalId: (id: string) => void
  setLatestIcpProfileId: (id: string) => void
  setLatestMarketSizingReportId: (id: string) => void
  setLatestPlaybookId: (id: string) => void

  reset: () => void
}

const INITIAL_STATE = {
  researchStatus: 'idle' as AgentStatus,
  icpStatus: 'idle' as AgentStatus,
  marketSizingStatus: 'idle' as AgentStatus,
  architectStatus: 'idle' as AgentStatus,
  researchRunId: null,
  icpRunId: null,
  marketSizingRunId: null,
  architectRunId: null,
  latestResearchSignalId: null,
  latestIcpProfileId: null,
  latestMarketSizingReportId: null,
  latestPlaybookId: null,
}

export const useAgentStore = create<AgentState>()((set) => ({
  ...INITIAL_STATE,

  setResearchStatus: (status, runId) =>
    set((s) => ({ researchStatus: status, researchRunId: runId ?? s.researchRunId })),

  setIcpStatus: (status, runId) =>
    set((s) => ({ icpStatus: status, icpRunId: runId ?? s.icpRunId })),

  setMarketSizingStatus: (status, runId) =>
    set((s) => ({ marketSizingStatus: status, marketSizingRunId: runId ?? s.marketSizingRunId })),

  setArchitectStatus: (status, runId) =>
    set((s) => ({ architectStatus: status, architectRunId: runId ?? s.architectRunId })),

  setLatestResearchSignalId: (id) => set({ latestResearchSignalId: id }),
  setLatestIcpProfileId: (id) => set({ latestIcpProfileId: id }),
  setLatestMarketSizingReportId: (id) => set({ latestMarketSizingReportId: id }),
  setLatestPlaybookId: (id) => set({ latestPlaybookId: id }),

  reset: () => set(INITIAL_STATE),
}))
