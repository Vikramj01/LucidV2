import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ProjectSlice {
  projectId: string | null
  projectName: string | null
  campaignId: string | null
  campaignName: string | null

  setProject: (p: { id: string; name: string }) => void
  setCampaign: (c: { id: string; name: string }) => void
  clearCampaign: () => void
  clearProject: () => void
}

export const useProjectStore = create<ProjectSlice>()(
  persist(
    (set) => ({
      projectId: null,
      projectName: null,
      campaignId: null,
      campaignName: null,

      setProject: (p) =>
        set({ projectId: p.id, projectName: p.name, campaignId: null, campaignName: null }),

      setCampaign: (c) => set({ campaignId: c.id, campaignName: c.name }),

      clearCampaign: () => set({ campaignId: null, campaignName: null }),

      clearProject: () =>
        set({ projectId: null, projectName: null, campaignId: null, campaignName: null }),
    }),
    { name: 'lucid-project' }
  )
)
