'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

// ── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  total_organisations: number
  total_users: number
  total_agent_runs: number
  total_credits_used: number
}

interface OrgRow {
  id: string
  name: string
  org_type: string
  credit_balance: number
  credit_cap: number
  created_at: string
  workspaces: Array<{ id: string }>
}

interface UserRow {
  id: string
  email: string
  full_name: string | null
  role: string
  org_id: string | null
  created_at: string
}

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-[#30363D] bg-[#161B22] px-5 py-4">
      <p className="text-xs text-[#8B949E]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[#E6EDF3]">{value.toLocaleString()}</p>
    </div>
  )
}

// ── Organisations table ───────────────────────────────────────────────────────

function OrgsTable({ orgs }: { orgs: OrgRow[] }) {
  return (
    <div className="rounded-lg border border-[#30363D] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#30363D] bg-[#161B22]">
        <h3 className="text-xs font-semibold text-[#E6EDF3]">Organisations ({orgs.length})</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#30363D] bg-[#0D1117]">
              {['Name', 'Type', 'Workspaces', 'Credits', 'Created'].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left font-medium text-[#8B949E]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => (
              <tr key={org.id} className="border-b border-[#21262D] last:border-0 hover:bg-[#161B22] transition-colors">
                <td className="px-4 py-2.5 text-[#E6EDF3] font-medium">{org.name}</td>
                <td className="px-4 py-2.5 text-[#8B949E] capitalize">{org.org_type}</td>
                <td className="px-4 py-2.5 text-[#8B949E]">{org.workspaces?.length ?? 0}</td>
                <td className="px-4 py-2.5">
                  <span className="text-[#3FB950]">{org.credit_balance.toLocaleString()}</span>
                  <span className="text-[#484F58]"> / {org.credit_cap.toLocaleString()}</span>
                </td>
                <td className="px-4 py-2.5 text-[#484F58]">
                  {new Date(org.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {orgs.length === 0 && (
          <p className="px-4 py-6 text-xs text-[#484F58] text-center">No organisations yet.</p>
        )}
      </div>
    </div>
  )
}

// ── Users table ───────────────────────────────────────────────────────────────

const ROLE_STYLES: Record<string, string> = {
  super_admin:      'text-[#F85149] bg-[#3D1F1F]',
  org_admin:        'text-[#E3B341] bg-[#3D2E0A]',
  workspace_member: 'text-[#8B949E] bg-[#21262D]',
}

function UsersTable({ users }: { users: UserRow[] }) {
  return (
    <div className="rounded-lg border border-[#30363D] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#30363D] bg-[#161B22]">
        <h3 className="text-xs font-semibold text-[#E6EDF3]">Users ({users.length})</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#30363D] bg-[#0D1117]">
              {['Email / Name', 'Role', 'Org', 'Joined'].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left font-medium text-[#8B949E]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-[#21262D] last:border-0 hover:bg-[#161B22] transition-colors">
                <td className="px-4 py-2.5">
                  <p className="text-[#E6EDF3]">{u.email}</p>
                  {u.full_name && <p className="text-[#484F58]">{u.full_name}</p>}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ROLE_STYLES[u.role] ?? 'text-[#8B949E] bg-[#21262D]'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-[#484F58] font-mono text-[10px]">
                  {u.org_id ? u.org_id.slice(0, 8) + '…' : '—'}
                </td>
                <td className="px-4 py-2.5 text-[#484F58]">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <p className="px-4 py-6 text-xs text-[#484F58] text-center">No users yet.</p>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'organisations' | 'users'

export function AdminDashboard() {
  const [tab, setTab] = useState<Tab>('overview')
  const [stats, setStats] = useState<Stats | null>(null)
  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.admin.getStats(),
      api.admin.listOrganisations(),
      api.admin.listUsers(),
    ])
      .then(([s, o, u]) => {
        setStats(s)
        setOrgs(o)
        setUsers(u)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'organisations', label: `Organisations${stats ? ` (${stats.total_organisations})` : ''}` },
    { id: 'users', label: `Users${stats ? ` (${stats.total_users})` : ''}` },
  ]

  return (
    <div className="min-h-screen bg-[#0D1117] text-[#E6EDF3]">
      {/* Header */}
      <div className="border-b border-[#30363D] px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-xs text-[#8B949E] hover:text-[#E6EDF3] transition-colors">
            ← Dashboard
          </a>
          <span className="text-[#30363D]">/</span>
          <h1 className="text-sm font-semibold">Admin Panel</h1>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium text-[#F85149] bg-[#3D1F1F]">
            super_admin
          </span>
        </div>
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                tab === t.id
                  ? 'bg-[#21262D] text-[#E6EDF3]'
                  : 'text-[#8B949E] hover:text-[#E6EDF3] hover:bg-[#161B22]',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-8 py-6 max-w-6xl mx-auto space-y-6">
        {loading && (
          <p className="text-xs text-[#484F58]">Loading…</p>
        )}
        {error && (
          <div className="rounded-lg border border-[#F85149] bg-[#3D1F1F] px-4 py-3 text-xs text-[#F85149]">
            {error}
          </div>
        )}

        {!loading && !error && tab === 'overview' && stats && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="Organisations" value={stats.total_organisations} />
              <StatCard label="Users" value={stats.total_users} />
              <StatCard label="Agent Runs" value={stats.total_agent_runs} />
              <StatCard label="Total Credits Used" value={stats.total_credits_used} />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <OrgsTable orgs={orgs.slice(0, 5)} />
              <UsersTable users={users.slice(0, 5)} />
            </div>
          </>
        )}

        {!loading && !error && tab === 'organisations' && (
          <OrgsTable orgs={orgs} />
        )}

        {!loading && !error && tab === 'users' && (
          <UsersTable users={users} />
        )}
      </div>
    </div>
  )
}
