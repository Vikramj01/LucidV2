'use client'

import { useState } from 'react'
import { OverviewTab } from './tabs/OverviewTab'
import { IntelTab } from './tabs/IntelTab'
import { ArchitectTab } from './tabs/ArchitectTab'
import { VaultTab } from './tabs/VaultTab'

type Tab = 'overview' | 'intel' | 'architect' | 'vault'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'intel', label: 'Intel' },
  { id: 'architect', label: 'Architect' },
  { id: 'vault', label: 'Vault' },
]

export function MissionControlCanvas({ workspaceId }: { workspaceId: string }) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  return (
    <div className="flex flex-col h-full bg-[#0D1117]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#30363D] shrink-0">
        <h1 className="text-sm font-semibold text-[#E6EDF3] tracking-wide uppercase">
          Mission Control
        </h1>
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                activeTab === tab.id
                  ? 'bg-[#21262D] text-[#E6EDF3]'
                  : 'text-[#8B949E] hover:text-[#E6EDF3] hover:bg-[#161B22]',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'overview' && <OverviewTab workspaceId={workspaceId} />}
        {activeTab === 'intel' && <IntelTab workspaceId={workspaceId} />}
        {activeTab === 'architect' && <ArchitectTab workspaceId={workspaceId} />}
        {activeTab === 'vault' && <VaultTab workspaceId={workspaceId} />}
      </div>
    </div>
  )
}
