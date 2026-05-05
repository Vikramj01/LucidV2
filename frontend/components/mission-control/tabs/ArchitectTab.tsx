'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAgentStore } from '@/store/agent'

interface ChannelPlan {
  channel: string
  objective: string
  content_themes: string[]
  kpis: string[]
}

interface MessagingFramework {
  primary_message: string
  proof_points: string[]
  cta: string
}

interface PlaybookContent {
  executive_summary: string
  messaging_framework: MessagingFramework
  channel_plans: ChannelPlan[]
  differentiation: string
  risk_flags: string[]
}

interface Playbook {
  id: string
  created_at: string
  campaign_goal: string
  channels: string[]
  winning_angle: string
  target_persona: string
  playbook_content: PlaybookContent
  status: 'draft' | 'approved'
  approved_at: string | null
}

function ApprovalGate({
  playbookId,
  workspaceId,
  status,
  onApproved,
}: {
  playbookId: string
  workspaceId: string
  status: string
  onApproved: () => void
}) {
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status === 'approved') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#0D4429] border border-[#3FB950] text-[#3FB950] text-xs font-medium">
        <span>✓</span> Approved
      </div>
    )
  }

  async function handleApprove() {
    setApproving(true)
    setError(null)
    try {
      await api.outputs.approvePlaybook(workspaceId, playbookId)
      onApproved()
    } catch (e) {
      setError(String(e))
    } finally {
      setApproving(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-[#F85149]">{error}</span>}
      <button
        onClick={handleApprove}
        disabled={approving}
        className="px-3 py-1.5 text-xs font-medium rounded-md bg-[#238636] text-white hover:bg-[#2EA043] disabled:opacity-50 transition-colors"
      >
        {approving ? 'Approving…' : 'Approve Playbook'}
      </button>
    </div>
  )
}

function PlaybookCard({
  playbook,
  workspaceId,
  onApproved,
}: {
  playbook: Playbook
  workspaceId: string
  onApproved: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const content = playbook.playbook_content

  return (
    <div className="rounded-lg border border-[#30363D] bg-[#161B22] overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          className="flex-1 text-left hover:opacity-80 transition-opacity"
          onClick={() => setOpen((v) => !v)}
        >
          <p className="text-sm font-medium text-[#E6EDF3]">
            {playbook.campaign_goal.charAt(0).toUpperCase() + playbook.campaign_goal.slice(1)} Campaign
          </p>
          <p className="text-xs text-[#8B949E] mt-0.5">
            {playbook.channels.join(', ')} · {new Date(playbook.created_at).toLocaleDateString()}
          </p>
        </button>
        <ApprovalGate
          playbookId={playbook.id}
          workspaceId={workspaceId}
          status={playbook.status}
          onApproved={() => onApproved(playbook.id)}
        />
      </div>

      {/* Winning angle (always visible) */}
      <div className="px-4 pb-3">
        <p className="text-xs font-medium text-[#E3B341]">{playbook.winning_angle}</p>
        <p className="text-xs text-[#8B949E] mt-0.5">{playbook.target_persona}</p>
      </div>

      {/* Expanded content */}
      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-[#30363D] pt-3">
          <div>
            <Label>Executive Summary</Label>
            <p className="text-xs text-[#E6EDF3] leading-relaxed">{content.executive_summary}</p>
          </div>

          <div>
            <Label>Primary Message</Label>
            <p className="text-xs text-[#3FB950] font-medium">{content.messaging_framework.primary_message}</p>
            <p className="text-xs text-[#8B949E] mt-1">CTA: {content.messaging_framework.cta}</p>
            <ul className="mt-1.5 space-y-0.5">
              {content.messaging_framework.proof_points.map((p, i) => (
                <li key={i} className="text-xs text-[#E6EDF3] flex gap-1.5">
                  <span className="text-[#388BFD] shrink-0">▸</span>{p}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <Label>Channel Plans</Label>
            <div className="space-y-2 mt-1">
              {content.channel_plans.map((cp, i) => (
                <div key={i} className="rounded border border-[#30363D] p-2.5">
                  <p className="text-xs font-semibold text-[#E6EDF3] capitalize">{cp.channel}</p>
                  <p className="text-xs text-[#8B949E] mt-0.5">{cp.objective}</p>
                  <p className="text-[10px] text-[#484F58] mt-1">
                    KPIs: {cp.kpis.join(' · ')}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label>Differentiation</Label>
            <p className="text-xs text-[#E6EDF3]">{content.differentiation}</p>
          </div>

          {content.risk_flags.length > 0 && (
            <div>
              <Label>Risk Flags</Label>
              <ul className="space-y-0.5">
                {content.risk_flags.map((r, i) => (
                  <li key={i} className="text-xs text-[#E3B341] flex gap-1.5">
                    <span className="shrink-0">⚠</span>{r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-[#8B949E] uppercase tracking-wider mb-1">
      {children}
    </p>
  )
}

export function ArchitectTab({ workspaceId }: { workspaceId: string }) {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const architectStatus = useAgentStore((s) => s.architectStatus)

  useEffect(() => {
    setLoading(true)
    api.outputs.listPlaybooks(workspaceId)
      .then((data) => setPlaybooks(data as Playbook[]))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [workspaceId, architectStatus])

  function handleApproved(id: string) {
    setPlaybooks((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: 'approved' } : p))
    )
  }

  if (loading) return <EmptyState message="Loading playbooks..." />
  if (error) return <EmptyState message={`Error: ${error}`} />
  if (playbooks.length === 0) {
    return (
      <EmptyState
        message="No campaign playbooks yet."
        hint="Ask Vimi to run the Architect Agent once Intel has completed."
      />
    )
  }

  return (
    <div className="p-6 space-y-3">
      <h2 className="text-xs font-semibold text-[#8B949E] uppercase tracking-wider">
        Campaign Playbooks ({playbooks.length})
      </h2>
      {playbooks.map((p) => (
        <PlaybookCard
          key={p.id}
          playbook={p}
          workspaceId={workspaceId}
          onApproved={handleApproved}
        />
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
