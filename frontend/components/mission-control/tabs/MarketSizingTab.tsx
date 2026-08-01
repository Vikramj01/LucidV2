'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAgentStore } from '@/store/agent'

interface MarketSizeEstimate {
  value: string
  currency: string
  methodology: string
  assumptions: string[]
}

interface MarketSizingReport {
  id: string
  created_at: string
  tam_estimate: MarketSizeEstimate
  sam_estimate: MarketSizeEstimate
  som_estimate: MarketSizeEstimate
  methodology_notes: string
  sources: string[]
}

function EstimateCard({ label, estimate, color }: { label: string; estimate: MarketSizeEstimate; color: string }) {
  return (
    <div className="rounded border border-[#30363D] p-3">
      <p className="text-[10px] font-semibold text-[#8B949E] uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 ${color}`}>{estimate.value}</p>
      <p className="text-[10px] text-[#8B949E] mt-1">{estimate.methodology}</p>
      {estimate.assumptions.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {estimate.assumptions.map((a, i) => (
            <li key={i} className="text-[10px] text-[#484F58] flex gap-1">
              <span className="shrink-0">•</span>{a}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ReportCard({ report }: { report: MarketSizingReport }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-lg border border-[#30363D] bg-[#161B22] overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#1C2128] transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <p className="text-sm font-medium text-[#E6EDF3]">Market Sizing Report</p>
          <p className="text-xs text-[#8B949E] mt-0.5">
            TAM {report.tam_estimate.value} · {new Date(report.created_at).toLocaleDateString()}
          </p>
        </div>
        <span className="text-[#8B949E] text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-[#30363D] pt-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <EstimateCard label="TAM" estimate={report.tam_estimate} color="text-[#388BFD]" />
            <EstimateCard label="SAM" estimate={report.sam_estimate} color="text-[#E3B341]" />
            <EstimateCard label="SOM" estimate={report.som_estimate} color="text-[#3FB950]" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-[#8B949E] uppercase tracking-wider mb-1">
              Methodology Notes
            </p>
            <p className="text-xs text-[#E6EDF3] leading-relaxed">{report.methodology_notes}</p>
          </div>
          {report.sources.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-[#8B949E] uppercase tracking-wider mb-1">
                Sources
              </p>
              <p className="text-[10px] text-[#484F58]">{report.sources.join(' · ')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function MarketSizingTab({ workspaceId, projectId }: { workspaceId: string; projectId: string | null }) {
  const [reports, setReports] = useState<MarketSizingReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const marketSizingStatus = useAgentStore((s) => s.marketSizingStatus)

  useEffect(() => {
    if (!projectId) {
      setReports([])
      setLoading(false)
      return
    }
    setLoading(true)
    api.outputs.listMarketSizingReports(workspaceId, projectId)
      .then((data) => setReports(data as MarketSizingReport[]))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [workspaceId, projectId, marketSizingStatus])

  if (!projectId) return <EmptyState message="Select or create a project to see market sizing reports." />
  if (loading) return <EmptyState message="Loading market sizing reports..." />
  if (error) return <EmptyState message={`Error: ${error}`} />
  if (reports.length === 0) {
    return (
      <EmptyState
        message="No market sizing reports yet."
        hint="Ask Vimi to run the Market Sizing Agent once Research has completed."
      />
    )
  }

  return (
    <div className="p-6 space-y-3">
      <h2 className="text-xs font-semibold text-[#8B949E] uppercase tracking-wider">
        Market Sizing Reports ({reports.length})
      </h2>
      {reports.map((r) => <ReportCard key={r.id} report={r} />)}
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
