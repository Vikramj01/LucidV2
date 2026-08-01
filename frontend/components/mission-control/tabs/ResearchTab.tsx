'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAgentStore } from '@/store/agent'

// Shape matches agent-service/app/nodes/research/extract_node.py's actual
// output — see shared/types/index.ts CompetitorProfile.

interface CompetitorProfile {
  name: string
  url: string
  positioning: string
  key_messages: string[]
  icp: string
  weaknesses: string[]
}

interface ResearchSignal {
  id: string
  created_at: string
  competitors_analysed: string[]
  competitor_profiles: CompetitorProfile[]
  market_gaps: string[]
  intent_triggers: string[]
  recommended_angles: string[]
}

function SignalCard({ signal }: { signal: ResearchSignal }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-lg border border-[#30363D] bg-[#161B22] overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#1C2128] transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <p className="text-sm font-medium text-[#E6EDF3]">
            Research Signal
          </p>
          <p className="text-xs text-[#8B949E] mt-0.5">
            {signal.competitors_analysed.length} competitors ·{' '}
            {new Date(signal.created_at).toLocaleDateString()}
          </p>
        </div>
        <span className="text-[#8B949E] text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-[#30363D]">
          {/* Market gaps */}
          <Section title="Market Gaps" items={signal.market_gaps} color="text-[#388BFD]" />
          <Section title="Intent Triggers" items={signal.intent_triggers} color="text-[#E3B341]" />
          <Section title="Recommended Angles" items={signal.recommended_angles} color="text-[#3FB950]" />

          {/* Competitor profiles */}
          {signal.competitor_profiles.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-[#8B949E] uppercase tracking-wider mt-3 mb-2">
                Competitors
              </p>
              <div className="space-y-2">
                {signal.competitor_profiles.map((c, i) => (
                  <div key={i} className="rounded border border-[#30363D] p-3">
                    <div className="flex items-baseline justify-between">
                      <p className="text-xs font-semibold text-[#E6EDF3]">{c.name}</p>
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-[#388BFD] hover:underline"
                      >
                        {c.url}
                      </a>
                    </div>
                    <p className="text-xs text-[#8B949E] mt-1">{c.positioning}</p>
                    {c.weaknesses.length > 0 && (
                      <p className="text-[10px] text-[#F85149] mt-1">
                        Weaknesses: {c.weaknesses.join(', ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  items,
  color,
}: {
  title: string
  items: string[]
  color: string
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-[#8B949E] uppercase tracking-wider mt-3 mb-1.5">
        {title}
      </p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-xs text-[#E6EDF3]">
            <span className={`mt-0.5 shrink-0 ${color}`}>▸</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ResearchTab({ workspaceId, projectId }: { workspaceId: string; projectId: string | null }) {
  const [signals, setSignals] = useState<ResearchSignal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const researchStatus = useAgentStore((s) => s.researchStatus)

  useEffect(() => {
    if (!projectId) {
      setSignals([])
      setLoading(false)
      return
    }
    setLoading(true)
    api.outputs.listResearchSignals(workspaceId, projectId)
      .then((data) => setSignals(data as ResearchSignal[]))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [workspaceId, projectId, researchStatus]) // refetch when research agent completes

  if (!projectId) return <EmptyState message="Select or create a project to see research signals." />
  if (loading) return <EmptyState message="Loading research signals..." />
  if (error) return <EmptyState message={`Error: ${error}`} />
  if (signals.length === 0) {
    return (
      <EmptyState
        message="No research signals yet."
        hint="Ask Vimi to run the Research Agent to analyse your competitors."
      />
    )
  }

  return (
    <div className="p-6 space-y-3">
      <h2 className="text-xs font-semibold text-[#8B949E] uppercase tracking-wider">
        Research Signals ({signals.length})
      </h2>
      {signals.map((s) => (
        <SignalCard key={s.id} signal={s} />
      ))}
    </div>
  )
}

function EmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-64 p-6 text-center">
      <p className="text-sm text-[#8B949E]">{message}</p>
      {hint && <p className="mt-1 text-xs text-[#484F58]">{hint}</p>}
    </div>
  )
}
