import { create } from 'zustand'

export type AgentStatus = 'idle' | 'queued' | 'running' | 'complete' | 'failed'

export interface AgentState {
  researchStatus: AgentStatus
  architectStatus: AgentStatus
  researchRunId: string | null
  architectRunId: string | null
  latestPlaybookId: string | null

  setResearchStatus: (status: AgentStatus, runId?: string) => void
  setArchitectStatus: (status: AgentStatus, runId?: string) => void
  setLatestPlaybookId: (id: string) => void
  reset: () => void
}

export const useAgentStore = create<AgentState>()((set) => ({
  researchStatus: 'idle',
  architectStatus: 'idle',
  researchRunId: null,
  architectRunId: null,
  latestPlaybookId: null,

  setResearchStatus: (status, runId) =>
    set((s) => ({ researchStatus: status, researchRunId: runId ?? s.researchRunId })),

  setArchitectStatus: (status, runId) =>
    set((s) => ({ architectStatus: status, architectRunId: runId ?? s.architectRunId })),

  setLatestPlaybookId: (id) => set({ latestPlaybookId: id }),

  reset: () =>
    set({
      researchStatus: 'idle',
      architectStatus: 'idle',
      researchRunId: null,
      architectRunId: null,
      latestPlaybookId: null,
    }),
}))
