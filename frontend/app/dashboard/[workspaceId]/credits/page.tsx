'use client'

import { use, useEffect, useState } from 'react'
import { useWorkspaceStore } from '@/store/workspace'
import { api } from '@/lib/api'

interface LedgerEntry {
  action_type: string
  credits_used: number
  created_at: string
  agent_run_id: string
}

const ACTION_COLORS: Record<string, string> = {
  intel_run:     'text-[#388BFD]',
  architect_run: 'text-[#3FB950]',
  vault_ingest:  'text-[#8B949E]',
}

function CreditBar({ used, cap }: { used: number; cap: number }) {
  const pct = Math.min((used / Math.max(cap, 1)) * 100, 100)
  const color = pct > 80 ? 'bg-[#F85149]' : pct > 50 ? 'bg-[#E3B341]' : 'bg-[#3FB950]'
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-[#8B949E]">Credits remaining</span>
        <span className="text-[#E6EDF3] font-medium tabular-nums">
          {(cap - used).toLocaleString()} / {cap.toLocaleString()}
        </span>
      </div>
      <div className="h-2 rounded-full bg-[#21262D] overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-[#484F58]">{pct.toFixed(1)}% used</p>
    </div>
  )
}

export default function CreditsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = use(params)
  const { orgId, workspaceName } = useWorkspaceStore()

  const [orgCredits, setOrgCredits] = useState<{ credit_balance: number; credit_cap: number } | null>(null)
  const [orgLedger, setOrgLedger] = useState<Array<{ workspace_id: string; action_type: string; credits_used: number; created_at: string }>>([])
  const [wsLedger, setWsLedger] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!orgId) return
    Promise.all([
      api.credits.getOrgCredits(orgId),
      api.credits.getWorkspaceCredits(workspaceId),
    ])
      .then(([org, ws]) => {
        setOrgCredits(org.org)
        setOrgLedger(org.ledger)
        setWsLedger(ws.ledger)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [orgId, workspaceId])

  const totalUsed = orgCredits
    ? orgCredits.credit_cap - orgCredits.credit_balance
    : 0

  const wsTotal = wsLedger.reduce((s, e) => s + e.credits_used, 0)

  return (
    <div className="flex-1 overflow-y-auto bg-[#0D1117] min-h-0">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-[#8B949E]">
          <a href={`/dashboard/${workspaceId}`} className="hover:text-[#E6EDF3] transition-colors">
            {workspaceName ?? 'Workspace'}
          </a>
          <span className="text-[#30363D]">/</span>
          <span className="text-[#E6EDF3]">Credits</span>
        </div>

        {loading && <p className="text-xs text-[#484F58]">Loading credit data…</p>}
        {error && (
          <div className="rounded-lg border border-[#F85149] bg-[#3D1F1F] px-4 py-3 text-xs text-[#F85149]">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Org credit pool */}
            {orgCredits && (
              <section className="rounded-lg border border-[#30363D] bg-[#161B22] p-5 space-y-4">
                <h2 className="text-xs font-semibold text-[#8B949E] uppercase tracking-wider">
                  Organisation Credit Pool
                </h2>
                <CreditBar used={totalUsed} cap={orgCredits.credit_cap} />
                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="rounded border border-[#30363D] px-3 py-2">
                    <p className="text-[10px] text-[#8B949E]">Balance</p>
                    <p className="text-sm font-semibold text-[#3FB950] tabular-nums">
                      {orgCredits.credit_balance.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded border border-[#30363D] px-3 py-2">
                    <p className="text-[10px] text-[#8B949E]">Used</p>
                    <p className="text-sm font-semibold text-[#E6EDF3] tabular-nums">
                      {totalUsed.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded border border-[#30363D] px-3 py-2">
                    <p className="text-[10px] text-[#8B949E]">Cap</p>
                    <p className="text-sm font-semibold text-[#8B949E] tabular-nums">
                      {orgCredits.credit_cap.toLocaleString()}
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-[#484F58]">
                  MVP1 tracks credits but does not gate on them. Billing enforcement is a future phase.
                </p>
              </section>
            )}

            {/* Workspace usage */}
            <section className="rounded-lg border border-[#30363D] bg-[#161B22] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-[#8B949E] uppercase tracking-wider">
                  This Workspace
                </h2>
                <span className="text-xs text-[#E6EDF3] font-medium tabular-nums">
                  {wsTotal.toLocaleString()} credits used
                </span>
              </div>

              {wsLedger.length === 0 ? (
                <p className="text-xs text-[#484F58] py-4 text-center">
                  No credit activity yet. Run the Intel or Architect Agent to start.
                </p>
              ) : (
                <div className="rounded border border-[#30363D] overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#30363D] bg-[#0D1117]">
                        {['Action', 'Credits', 'Date'].map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-medium text-[#8B949E]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {wsLedger.map((entry, i) => (
                        <tr key={i} className="border-b border-[#21262D] last:border-0">
                          <td className="px-3 py-2">
                            <span className={`font-medium capitalize ${ACTION_COLORS[entry.action_type] ?? 'text-[#8B949E]'}`}>
                              {entry.action_type.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-3 py-2 tabular-nums text-[#E6EDF3]">
                            {entry.credits_used}
                          </td>
                          <td className="px-3 py-2 text-[#484F58]">
                            {new Date(entry.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Org-wide breakdown (shows all workspaces) */}
            {orgLedger.length > 0 && (
              <section className="rounded-lg border border-[#30363D] bg-[#161B22] p-5 space-y-3">
                <h2 className="text-xs font-semibold text-[#8B949E] uppercase tracking-wider">
                  Organisation Activity ({orgLedger.length} events)
                </h2>
                <div className="rounded border border-[#30363D] overflow-hidden max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0">
                      <tr className="border-b border-[#30363D] bg-[#0D1117]">
                        {['Workspace', 'Action', 'Credits', 'Date'].map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-medium text-[#8B949E]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {orgLedger.map((entry, i) => (
                        <tr key={i} className="border-b border-[#21262D] last:border-0">
                          <td className="px-3 py-2 text-[#484F58] font-mono text-[10px]">
                            {entry.workspace_id.slice(0, 8)}…
                          </td>
                          <td className="px-3 py-2">
                            <span className={`capitalize ${ACTION_COLORS[entry.action_type] ?? 'text-[#8B949E]'}`}>
                              {entry.action_type.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-3 py-2 tabular-nums text-[#E6EDF3]">
                            {entry.credits_used}
                          </td>
                          <td className="px-3 py-2 text-[#484F58]">
                            {new Date(entry.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
