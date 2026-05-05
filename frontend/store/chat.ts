import { create } from 'zustand'

export type ChatPhase =
  | 'WELCOME'
  | 'ORG_SETUP'
  | 'WORKSPACE_CREATE'
  | 'VAULT_INTRO'
  | 'VAULT_UPLOAD'
  | 'VAULT_COMPLETE'
  | 'INTEL_SETUP'
  | 'INTEL_RUNNING'
  | 'ARCHITECT_SETUP'
  | 'ARCHITECT_RUNNING'
  | 'ACTIVE'

export interface ChatMessage {
  id: string
  role: 'vimi' | 'user'
  content: string
  timestamp: number
}

export interface ChatState {
  phase: ChatPhase
  messages: ChatMessage[]

  setPhase: (phase: ChatPhase) => void
  addMessage: (role: ChatMessage['role'], content: string) => void
  reset: () => void
}

export const useChatStore = create<ChatState>()((set) => ({
  phase: 'WELCOME',
  messages: [],

  setPhase: (phase) => set({ phase }),

  addMessage: (role, content) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { id: crypto.randomUUID(), role, content, timestamp: Date.now() },
      ],
    })),

  reset: () => set({ phase: 'WELCOME', messages: [] }),
}))
