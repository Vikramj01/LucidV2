import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface WorkspaceSlice {
  workspaceId: string | null
  workspaceName: string | null
  orgId: string | null
  orgName: string | null
  // Current Project / Campaign — Research runs per Project, Architect per Campaign
  projectId: string | null
  projectName: string | null
  campaignId: string | null
  campaignName: string | null

  setWorkspace: (ws: { id: string; name: string; org_id: string }) => void
  enterWorkspace: (workspaceId: string) => void
  setOrg: (org: { id: string; name: string }) => void
  setProject: (project: { id: string; name: string } | null) => void
  setCampaign: (campaign: { id: string; name: string } | null) => void
  clear: () => void
}

const NO_SELECTION = { projectId: null, projectName: null, campaignId: null, campaignName: null }

export const useWorkspaceStore = create<WorkspaceSlice>()(
  persist(
    (set, get) => ({
      workspaceId: null,
      workspaceName: null,
      orgId: null,
      orgName: null,
      ...NO_SELECTION,

      setWorkspace: (ws) =>
        set({
          workspaceId: ws.id,
          workspaceName: ws.name,
          orgId: ws.org_id,
          // Projects never cross workspaces — drop the selection on switch
          ...(get().workspaceId === ws.id ? {} : NO_SELECTION),
        }),

      // Called when a workspace dashboard opens by URL; clears a Project/Campaign
      // selection that belongs to a different workspace.
      enterWorkspace: (workspaceId) => {
        if (get().workspaceId !== workspaceId) set({ workspaceId, ...NO_SELECTION })
      },

      setOrg: (org) => set({ orgId: org.id, orgName: org.name }),

      setProject: (project) =>
        set({
          projectId: project?.id ?? null,
          projectName: project?.name ?? null,
          campaignId: null,
          campaignName: null,
        }),

      setCampaign: (campaign) =>
        set({ campaignId: campaign?.id ?? null, campaignName: campaign?.name ?? null }),

      clear: () =>
        set({ workspaceId: null, workspaceName: null, orgId: null, orgName: null, ...NO_SELECTION }),
    }),
    { name: 'lucid-workspace' }
  )
)
