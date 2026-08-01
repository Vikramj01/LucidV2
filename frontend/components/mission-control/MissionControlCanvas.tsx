'use client'

import { useState } from 'react'
import { OverviewTab } from './tabs/OverviewTab'
import { ResearchTab } from './tabs/ResearchTab'
import { IcpTab } from './tabs/IcpTab'
import { MarketSizingTab } from './tabs/MarketSizingTab'
import { ArchitectTab } from './tabs/ArchitectTab'
import { VaultTab } from './tabs/VaultTab'
import { ProjectCampaignSelector } from './ProjectCampaignSelector'

type Tab = 'overview' | 'vault' | 'research' | 'icp' | 'market_sizing' | 'architect'

const WORKSPACE_TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'vault', label: 'Vault' },
]

const PROJECT_TABS: { id: Tab; label: string }[] = [
  { id: 'research', label: 'Research' },
  { id: 'icp', label: 'ICP' },
  { id: 'market_sizing', label: 'Market Sizing' },
]

const CAMPAIGN_TABS: { id: Tab; label: string }[] = [
  { id: 'architect', label: 'Architect' },
]

export function MissionControlCanvas({
  workspaceId,
  projectId,
  campaignId,
}: {
  workspaceId: string
  projectId: string | null
  campaignId: string | null
}) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  function renderTabButton(tab: { id: Tab; label: string }, disabled: boolean) {
    return (
      <button
        key={tab.id}
        onClick={() => !disabled && setActiveTab(tab.id)}
        disabled={disabled}
        title={disabled ? 'Select a project first' : undefined}
        className={[
          'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
          disabled
            ? 'text-[#484F58] cursor-not-allowed'
            : activeTab === tab.id
              ? 'bg-[#21262D] text-[#E6EDF3]'
              : 'text-[#8B949E] hover:text-[#E6EDF3] hover:bg-[#161B22]',
        ].join(' ')}
      >
        {tab.label}
      </button>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#0D1117]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#30363D] shrink-0 gap-4">
        <h1 className="text-sm font-semibold text-[#E6EDF3] tracking-wide uppercase shrink-0">
          Mission Control
        </h1>
        <ProjectCampaignSelector workspaceId={workspaceId} projectId={projectId} campaignId={campaignId} />
      </div>

      {/* Tab groups */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-6 py-3 border-b border-[#30363D] shrink-0">
        <div className="flex gap-1">
          {WORKSPACE_TABS.map((tab) => renderTabButton(tab, false))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-[#484F58] uppercase tracking-wider mr-1">Project Intel</span>
          {PROJECT_TABS.map((tab) => renderTabButton(tab, !projectId))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-[#484F58] uppercase tracking-wider mr-1">Campaign</span>
          {CAMPAIGN_TABS.map((tab) => renderTabButton(tab, !campaignId))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'overview' && <OverviewTab workspaceId={workspaceId} />}
        {activeTab === 'vault' && <VaultTab workspaceId={workspaceId} />}
        {activeTab === 'research' && <ResearchTab workspaceId={workspaceId} projectId={projectId} />}
        {activeTab === 'icp' && <IcpTab workspaceId={workspaceId} projectId={projectId} />}
        {activeTab === 'market_sizing' && <MarketSizingTab workspaceId={workspaceId} projectId={projectId} />}
        {activeTab === 'architect' && (
          <ArchitectTab workspaceId={workspaceId} projectId={projectId} campaignId={campaignId} />
        )}
      </div>
    </div>
  )
}
