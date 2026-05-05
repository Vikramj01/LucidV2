'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, ApiError } from '@/lib/api'
import { useWorkspaceStore } from '@/store/workspace'

type Step = 'org' | 'workspace'

export default function OnboardingPage() {
  const router = useRouter()
  const { setWorkspace, setOrg } = useWorkspaceStore()
  const [step, setStep] = useState<Step>('org')
  const [orgName, setOrgName] = useState('')
  const [orgType, setOrgType] = useState<'agency' | 'brand'>('brand')
  const [workspaceName, setWorkspaceName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)

  async function handleOrgSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const org = await api.organisations.create({ name: orgName, org_type: orgType })
      setOrg({ id: org.id, name: org.name })
      setOrgId(org.id)
      setStep('workspace')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleWorkspaceSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId) return
    setLoading(true)
    setError(null)
    try {
      const ws = await api.organisations.createWorkspace(orgId, { name: workspaceName })
      setWorkspace({ id: ws.id, name: ws.name, org_id: ws.org_id })
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0D1117] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-2 flex gap-2">
          <div className="h-1 flex-1 rounded-full bg-[#2D7DD2]" />
          <div className={`h-1 flex-1 rounded-full ${step === 'workspace' ? 'bg-[#2D7DD2]' : 'bg-[#30363D]'}`} />
        </div>

        <div className="mt-6 mb-8">
          <p className="text-xs text-[#8B949E] uppercase tracking-wider mb-1">
            Step {step === 'org' ? '1' : '2'} of 2
          </p>
          <h1 className="text-2xl font-semibold text-[#E6EDF3]">
            {step === 'org' ? 'Set up your organisation' : 'Name your first workspace'}
          </h1>
          <p className="mt-2 text-sm text-[#8B949E]">
            {step === 'org'
              ? 'Your organisation is the top-level account. Agencies can have multiple client workspaces.'
              : 'A workspace is one client brand. You can add more later.'}
          </p>
        </div>

        <div className="rounded-lg border border-[#30363D] bg-[#161B22] p-6">
          {step === 'org' ? (
            <form onSubmit={handleOrgSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-[#8B949E] mb-1">Organisation name</label>
                <input
                  type="text"
                  required
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  placeholder="Acme Marketing Agency"
                  className="w-full rounded-md border border-[#30363D] bg-[#1C2128] px-3 py-2 text-sm text-[#E6EDF3] placeholder-[#484F58] focus:border-[#2D7DD2] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm text-[#8B949E] mb-2">Account type</label>
                <div className="grid grid-cols-2 gap-3">
                  {(['brand', 'agency'] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setOrgType(type)}
                      className={`rounded-md border px-4 py-3 text-sm text-left transition-colors ${
                        orgType === type
                          ? 'border-[#2D7DD2] bg-[rgba(45,125,210,0.15)] text-[#E6EDF3]'
                          : 'border-[#30363D] text-[#8B949E] hover:border-[#484F58]'
                      }`}
                    >
                      <p className="font-medium capitalize">{type}</p>
                      <p className="text-xs mt-0.5 text-[#484F58]">
                        {type === 'brand' ? 'One brand, one workspace' : 'Multiple client brands'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-xs text-[#F85149]">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-[#2D7DD2] px-4 py-2 text-sm font-medium text-white hover:bg-[#2D7DD2]/90 disabled:opacity-50"
              >
                {loading ? 'Creating…' : 'Continue'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleWorkspaceSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-[#8B949E] mb-1">Workspace name</label>
                <input
                  type="text"
                  required
                  value={workspaceName}
                  onChange={e => setWorkspaceName(e.target.value)}
                  placeholder="e.g. Acme Corp or TechStartup Brand"
                  className="w-full rounded-md border border-[#30363D] bg-[#1C2128] px-3 py-2 text-sm text-[#E6EDF3] placeholder-[#484F58] focus:border-[#2D7DD2] focus:outline-none"
                />
              </div>

              {error && <p className="text-xs text-[#F85149]">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-[#2D7DD2] px-4 py-2 text-sm font-medium text-white hover:bg-[#2D7DD2]/90 disabled:opacity-50"
              >
                {loading ? 'Creating…' : 'Launch Lucid'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
