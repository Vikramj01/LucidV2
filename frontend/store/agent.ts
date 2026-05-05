import { create } from 'zustand'

export type AgentStatus = 'idle' | 'queued' | 'running' | 'complete' | 'failed'

export interface AgentState {
  intelStatus: AgentStatus
  architectStatus: AgentStatus
  intelRunId: string | null
  architectRunId: string | null

  setIntelStatus: (status: AgentStatus, runId?: string) => void
  setArchitectStatus: (status: AgentStatus, runId?: string) => void
  reset: () => void
}

export const useAgentStore = create<AgentState>()((set) => ({
  intelStatus: 'idle',
  architectStatus: 'idle',
  intelRunId: null,
  architectRunId: null,

  setIntelStatus: (status, runId) =>
    set((s) => ({ intelStatus: status, intelRunId: runId ?? s.intelRunId })),

  setArchitectStatus: (status, runId) =>
    set((s) => ({ architectStatus: status, architectRunId: runId ?? s.architectRunId })),

  reset: () =>
    set({ intelStatus: 'idle', architectStatus: 'idle', intelRunId: null, architectRunId: null }),
}))
