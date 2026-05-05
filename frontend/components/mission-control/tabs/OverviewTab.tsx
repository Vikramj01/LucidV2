'use client'

import { useAgentStore, AgentStatus } from '@/store/agent'

const STATUS_CONFIG: Record<AgentStatus, { label: string; color: string; dot: string }> = {
  idle:     { label: 'Idle',     color: 'text-[#484F58]', dot: 'bg-[#484F58]' },
  queued:   { label: 'Queued',   color: 'text-[#E3B341]', dot: 'bg-[#E3B341]' },
  running:  { label: 'Running',  color: 'text-[#388BFD]', dot: 'bg-[#388BFD] animate-pulse' },
  complete: { label: 'Complete', color: 'text-[#3FB950]', dot: 'bg-[#3FB950]' },
  failed:   { label: 'Failed',   color: 'text-[#F85149]', dot: 'bg-[#F85149]' },
}

function AgentCard({
  name,
  description,
  status,
  runId,
}: {
  name: string
  description: string
  status: AgentStatus
  runId: string | null
}) {
  const cfg = STATUS_CONFIG[status]
  return (
    <div className="rounded-lg border border-[#30363D] bg-[#161B22] p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-[#E6EDF3]">{name}</p>
          <p className="mt-0.5 text-xs text-[#8B949E]">{description}</p>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`h-2 w-2 rounded-full shrink-0 ${cfg.dot}`} />
          <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
        </div>
      </div>
      {runId && (
        <p className="mt-2 text-[10px] text-[#484F58] font-mono truncate">run: {runId}</p>
      )}
    </div>
  )
}

export function OverviewTab({ workspaceId: _ }: { workspaceId: string }) {
  const { intelStatus, architectStatus, intelRunId, architectRunId } = useAgentStore()

  return (
    <div className="p-6 space-y-6">
      <section>
        <h2 className="text-xs font-semibold text-[#8B949E] uppercase tracking-wider mb-3">
          Agents
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AgentCard
            name="Intel Agent"
            description="Competitor analysis → Market Signal JSON"
            status={intelStatus}
            runId={intelRunId}
          />
          <AgentCard
            name="Architect Agent"
            description="Market Signal + Vault → Campaign Playbook"
            status={architectStatus}
            runId={architectRunId}
          />
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold text-[#8B949E] uppercase tracking-wider mb-3">
          Infrastructure
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Supabase', status: 'Live' },
            { label: 'Redis Queue', status: 'Live' },
            { label: 'pgvector', status: 'Live' },
            { label: 'Realtime', status: 'Live' },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-[#30363D] bg-[#161B22] px-3 py-2.5"
            >
              <p className="text-[10px] text-[#8B949E]">{item.label}</p>
              <div className="flex items-center gap-1 mt-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[#3FB950]" />
                <p className="text-xs font-medium text-[#3FB950]">{item.status}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
