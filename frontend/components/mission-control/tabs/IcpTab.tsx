'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAgentStore } from '@/store/agent'

interface IcpFirmographics {
  company_size: string
  industry: string[]
  revenue_range: string
  geography: string[]
}

interface IcpPersona {
  title: string
  department: string
  seniority: string
  pain_points: string[]
  buying_triggers: string[]
  decision_role: string
}

interface IcpProfile {
  id: string
  created_at: string
  firmographics: IcpFirmographics
  personas: IcpPersona[]
  pain_points: string[]
  buying_triggers: string[]
  sources: string[]
}

function PersonaCard({ persona }: { persona: IcpPersona }) {
  return (
    <div className="rounded border border-[#30363D] p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold text-[#E6EDF3]">{persona.title}</p>
        <span className="text-[10px] text-[#8B949E] capitalize">{persona.decision_role}</span>
      </div>
      <p className="text-[10px] text-[#8B949E] mt-0.5">
        {persona.department} · {persona.seniority}
      </p>
      {persona.pain_points.length > 0 && (
        <p className="text-[10px] text-[#F85149] mt-1.5">
          Pain points: {persona.pain_points.join(', ')}
        </p>
      )}
      {persona.buying_triggers.length > 0 && (
        <p className="text-[10px] text-[#3FB950] mt-1">
          Buying triggers: {persona.buying_triggers.join(', ')}
        </p>
      )}
    </div>
  )
}

function IcpCard({ profile }: { profile: IcpProfile }) {
  const [open, setOpen] = useState(false)
  const fg = profile.firmographics

  return (
    <div className="rounded-lg border border-[#30363D] bg-[#161B22] overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#1C2128] transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <p className="text-sm font-medium text-[#E6EDF3]">ICP Profile</p>
          <p className="text-xs text-[#8B949E] mt-0.5">
            {profile.personas.length} personas · {new Date(profile.created_at).toLocaleDateString()}
          </p>
        </div>
        <span className="text-[#8B949E] text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-[#30363D] pt-3">
          <div>
            <p className="text-[11px] font-semibold text-[#8B949E] uppercase tracking-wider mb-1.5">
              Firmographics
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs text-[#E6EDF3]">
              <p><span className="text-[#8B949E]">Company size:</span> {fg.company_size}</p>
              <p><span className="text-[#8B949E]">Revenue:</span> {fg.revenue_range}</p>
              <p><span className="text-[#8B949E]">Industry:</span> {fg.industry.join(', ')}</p>
              <p><span className="text-[#8B949E]">Geography:</span> {fg.geography.join(', ')}</p>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-[#8B949E] uppercase tracking-wider mb-2">
              Personas
            </p>
            <div className="space-y-2">
              {profile.personas.map((p, i) => <PersonaCard key={i} persona={p} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function IcpTab({ workspaceId, projectId }: { workspaceId: string; projectId: string | null }) {
  const [profiles, setProfiles] = useState<IcpProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const icpStatus = useAgentStore((s) => s.icpStatus)

  useEffect(() => {
    if (!projectId) {
      setProfiles([])
      setLoading(false)
      return
    }
    setLoading(true)
    api.outputs.listIcpProfiles(workspaceId, projectId)
      .then((data) => setProfiles(data as IcpProfile[]))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [workspaceId, projectId, icpStatus])

  if (!projectId) return <EmptyState message="Select or create a project to see ICP profiles." />
  if (loading) return <EmptyState message="Loading ICP profiles..." />
  if (error) return <EmptyState message={`Error: ${error}`} />
  if (profiles.length === 0) {
    return (
      <EmptyState
        message="No ICP profiles yet."
        hint="Ask Vimi to run the ICP Agent once Research has completed."
      />
    )
  }

  return (
    <div className="p-6 space-y-3">
      <h2 className="text-xs font-semibold text-[#8B949E] uppercase tracking-wider">
        ICP Profiles ({profiles.length})
      </h2>
      {profiles.map((p) => <IcpCard key={p.id} profile={p} />)}
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
