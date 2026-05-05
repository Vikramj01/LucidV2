import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface WorkspaceSlice {
  workspaceId: string | null
  workspaceName: string | null
  orgId: string | null
  orgName: string | null

  setWorkspace: (ws: { id: string; name: string; org_id: string }) => void
  setOrg: (org: { id: string; name: string }) => void
  clear: () => void
}

export const useWorkspaceStore = create<WorkspaceSlice>()(
  persist(
    (set) => ({
      workspaceId: null,
      workspaceName: null,
      orgId: null,
      orgName: null,

      setWorkspace: (ws) =>
        set({ workspaceId: ws.id, workspaceName: ws.name, orgId: ws.org_id }),

      setOrg: (org) => set({ orgId: org.id, orgName: org.name }),

      clear: () =>
        set({ workspaceId: null, workspaceName: null, orgId: null, orgName: null }),
    }),
    { name: 'lucid-workspace' }
  )
)
