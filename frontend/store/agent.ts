import { create } from 'zustand'

export type AgentStatus = 'idle' | 'queued' | 'running' | 'complete' | 'failed'

export interface AgentState {
  intelStatus: AgentStatus
  architectStatus: AgentStatus
  intelRunId: string | null
  architectRunId: string | null
  latestSignalId: string | null
  latestPlaybookId: string | null

  setIntelStatus: (status: AgentStatus, runId?: string) => void
  setArchitectStatus: (status: AgentStatus, runId?: string) => void
  setLatestSignalId: (id: string) => void
  setLatestPlaybookId: (id: string) => void
  reset: () => void
}

export const useAgentStore = create<AgentState>()((set) => ({
  intelStatus: 'idle',
  architectStatus: 'idle',
  intelRunId: null,
  architectRunId: null,
  latestSignalId: null,
  latestPlaybookId: null,

  setIntelStatus: (status, runId) =>
    set((s) => ({ intelStatus: status, intelRunId: runId ?? s.intelRunId })),

  setArchitectStatus: (status, runId) =>
    set((s) => ({ architectStatus: status, architectRunId: runId ?? s.architectRunId })),

  setLatestSignalId: (id) => set({ latestSignalId: id }),
  setLatestPlaybookId: (id) => set({ latestPlaybookId: id }),

  reset: () =>
    set({
      intelStatus: 'idle',
      architectStatus: 'idle',
      intelRunId: null,
      architectRunId: null,
      latestSignalId: null,
      latestPlaybookId: null,
    }),
}))
