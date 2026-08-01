/**
 * Typed API client for the Lucid backend.
 * Automatically attaches the Supabase JWT as Authorization: Bearer <token>.
 * Use only in Client Components or browser contexts (reads from Supabase browser client).
 */
import { createClient } from '@/lib/supabase/client'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
}

async function getToken(): Promise<string | null> {
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = await getToken()
  const { body, ...rest } = options

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(rest.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed', code: 'UNKNOWN' }))
    throw new ApiError(err.error ?? 'Request failed', err.code ?? 'UNKNOWN', res.status)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ---- Shared response shapes ----

export interface Project {
  id: string
  workspace_id: string
  name: string
  description: string | null
  status: 'active' | 'archived'
  created_by: string
  created_at: string
  updated_at: string
}

export interface Campaign {
  id: string
  workspace_id: string
  project_id: string
  name: string
  campaign_goal: string
  channels: string[]
  status: 'active' | 'completed' | 'archived'
  created_by: string
  created_at: string
  updated_at: string
}

export interface IntegrationPublic {
  id: string
  workspace_id: string
  provider: 'google_drive' | 'notion'
  status: 'connected' | 'disconnected' | 'error'
  external_account_label: string | null
  connected_at: string
  last_synced_at: string | null
  error_message: string | null
}

export interface AgentRunRow {
  id: string
  workspace_id: string
  project_id: string | null
  campaign_id: string | null
  agent_type: string
  status: 'queued' | 'running' | 'complete' | 'failed'
  job_id: string | null
  error_message: string | null
  created_at: string
}

export const api = {
  organisations: {
    create: (body: { name: string; org_type: 'agency' | 'brand' }) =>
      request<{ id: string; name: string; org_type: string }>('/organisations', {
        method: 'POST',
        body,
      }),

    get: (id: string) =>
      request<{ id: string; name: string; workspaces: unknown[] }>(`/organisations/${id}`),

    createWorkspace: (orgId: string, body: { name: string; description?: string }) =>
      request<{ id: string; name: string; org_id: string }>(
        `/organisations/${orgId}/workspaces`,
        { method: 'POST', body }
      ),

    getCredits: (orgId: string) =>
      request<{ org: unknown; ledger: unknown[] }>(`/organisations/${orgId}/credits`),
  },

  workspaces: {
    get: (id: string) => request<{ id: string; name: string; org_id: string }>(`/workspaces/${id}`),

    update: (id: string, body: Record<string, unknown>) =>
      request<{ id: string }>(`/workspaces/${id}`, { method: 'PATCH', body }),

    getCredits: (id: string) =>
      request<{ ledger: unknown[] }>(`/workspaces/${id}/credits`),
  },

  projects: {
    list: (workspaceId: string, includeArchived = false) =>
      request<Project[]>(
        `/workspaces/${workspaceId}/projects${includeArchived ? '?include_archived=true' : ''}`
      ),

    create: (workspaceId: string, body: { name: string; description?: string }) =>
      request<Project>(`/workspaces/${workspaceId}/projects`, { method: 'POST', body }),

    get: (workspaceId: string, projectId: string) =>
      request<Project>(`/workspaces/${workspaceId}/projects/${projectId}`),

    update: (workspaceId: string, projectId: string, body: Record<string, unknown>) =>
      request<Project>(`/workspaces/${workspaceId}/projects/${projectId}`, {
        method: 'PATCH',
        body,
      }),

    archive: (workspaceId: string, projectId: string) =>
      request<void>(`/workspaces/${workspaceId}/projects/${projectId}`, { method: 'DELETE' }),
  },

  campaigns: {
    list: (workspaceId: string, projectId: string, includeArchived = false) =>
      request<Campaign[]>(
        `/workspaces/${workspaceId}/projects/${projectId}/campaigns${includeArchived ? '?include_archived=true' : ''}`
      ),

    create: (
      workspaceId: string,
      projectId: string,
      body: { name: string; campaign_goal: string; channels: string[] }
    ) =>
      request<Campaign>(`/workspaces/${workspaceId}/projects/${projectId}/campaigns`, {
        method: 'POST',
        body,
      }),

    get: (workspaceId: string, projectId: string, campaignId: string) =>
      request<Campaign>(
        `/workspaces/${workspaceId}/projects/${projectId}/campaigns/${campaignId}`
      ),

    archive: (workspaceId: string, projectId: string, campaignId: string) =>
      request<void>(
        `/workspaces/${workspaceId}/projects/${projectId}/campaigns/${campaignId}`,
        { method: 'DELETE' }
      ),
  },

  vault: {
    list: (workspaceId: string) =>
      request<unknown[]>(`/workspaces/${workspaceId}/vault`),

    uploadPdf: (workspaceId: string, body: { name: string; file_path: string; file_size_bytes?: number }) =>
      request<{ id: string; status: string; job_id: string }>(
        `/workspaces/${workspaceId}/vault/upload`,
        { method: 'POST', body }
      ),

    addUrl: (workspaceId: string, body: { url: string; name?: string }) =>
      request<{ id: string; status: string; job_id: string }>(
        `/workspaces/${workspaceId}/vault/url`,
        { method: 'POST', body }
      ),

    addText: (workspaceId: string, body: { name: string; text: string }) =>
      request<{ id: string; status: string; job_id: string }>(
        `/workspaces/${workspaceId}/vault/text`,
        { method: 'POST', body }
      ),

    addDriveFile: (workspaceId: string, body: { file_id: string; name: string }) =>
      request<{ id: string; status: string; job_id: string }>(
        `/workspaces/${workspaceId}/vault/drive`,
        { method: 'POST', body }
      ),

    addNotionPage: (workspaceId: string, body: { page_id_or_url: string; name: string }) =>
      request<{ id: string; status: string; job_id: string }>(
        `/workspaces/${workspaceId}/vault/notion`,
        { method: 'POST', body }
      ),

    delete: (workspaceId: string, docId: string) =>
      request<void>(`/workspaces/${workspaceId}/vault/${docId}`, { method: 'DELETE' }),

    /** Step 1: get a signed upload URL for a PDF. Filename must end in .pdf */
    getUploadUrl: (workspaceId: string, filename: string) =>
      request<{ document_id: string; upload_url: string; file_path: string }>(
        `/workspaces/${workspaceId}/vault/upload-url?filename=${encodeURIComponent(filename)}`
      ),

    /** Step 2: PUT the file bytes directly to the signed URL (no auth header — URL is pre-signed) */
    uploadToStorage: async (signedUrl: string, file: File): Promise<void> => {
      const res = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: file,
      })
      if (!res.ok) throw new ApiError('Upload to storage failed', 'STORAGE_ERROR', res.status)
    },

    /** Step 3: confirm the upload and trigger ingestion */
    confirmUpload: (workspaceId: string, document_id: string, file_size_bytes: number) =>
      request<{ document_id: string; job_id: string }>(
        `/workspaces/${workspaceId}/vault/confirm`,
        { method: 'POST', body: { document_id, file_size_bytes } }
      ),

    /** Convenience: full PDF upload in one call */
    uploadPdfFile: async (workspaceId: string, file: File) => {
      const { document_id, upload_url } = await api.vault.getUploadUrl(workspaceId, file.name)
      await api.vault.uploadToStorage(upload_url, file)
      return api.vault.confirmUpload(workspaceId, document_id, file.size)
    },
  },

  integrations: {
    list: (workspaceId: string) =>
      request<IntegrationPublic[]>(`/workspaces/${workspaceId}/integrations`),

    disconnect: (workspaceId: string, provider: 'google_drive' | 'notion') =>
      request<void>(`/workspaces/${workspaceId}/integrations/${provider}`, { method: 'DELETE' }),

    /**
     * Fetches the provider consent URL (a fetch call, so it can carry the
     * Bearer token) — the CALLER is responsible for navigating the browser
     * to it (e.g. `window.location.href = url`), since that's the actual
     * OAuth redirect step and can't happen inside a fetch().
     */
    getConnectUrl: (workspaceId: string, provider: 'google_drive' | 'notion') =>
      request<{ url: string }>(`/integrations/${provider}/connect?workspace_id=${workspaceId}`),
  },

  agents: {
    runResearch: (
      workspaceId: string,
      projectId: string,
      body: { competitor_urls: string[]; industry_keywords?: string; research_questions?: string[] }
    ) =>
      request<{ id: string; status: string; job_id: string }>(
        `/workspaces/${workspaceId}/projects/${projectId}/agents/research/run`,
        { method: 'POST', body }
      ),

    runIcp: (
      workspaceId: string,
      projectId: string,
      body: { research_signal_id?: string }
    ) =>
      request<{ id: string; status: string; job_id: string }>(
        `/workspaces/${workspaceId}/projects/${projectId}/agents/icp/run`,
        { method: 'POST', body }
      ),

    runMarketSizing: (
      workspaceId: string,
      projectId: string,
      body: { research_signal_id?: string; market_data_urls?: string[] }
    ) =>
      request<{ id: string; status: string; job_id: string }>(
        `/workspaces/${workspaceId}/projects/${projectId}/agents/market-sizing/run`,
        { method: 'POST', body }
      ),

    runArchitect: (
      workspaceId: string,
      projectId: string,
      campaignId: string,
      body: { research_signal_id?: string; icp_profile_id?: string; market_sizing_report_id?: string }
    ) =>
      request<{ id: string; status: string; job_id: string }>(
        `/workspaces/${workspaceId}/projects/${projectId}/campaigns/${campaignId}/agents/architect/run`,
        { method: 'POST', body }
      ),

    listWorkspaceRuns: (workspaceId: string) =>
      request<AgentRunRow[]>(`/workspaces/${workspaceId}/agents/runs`),

    listProjectRuns: (workspaceId: string, projectId: string) =>
      request<AgentRunRow[]>(`/workspaces/${workspaceId}/projects/${projectId}/agents/runs`),

    listCampaignRuns: (workspaceId: string, projectId: string, campaignId: string) =>
      request<AgentRunRow[]>(
        `/workspaces/${workspaceId}/projects/${projectId}/campaigns/${campaignId}/agents/runs`
      ),
  },

  outputs: {
    listResearchSignals: (workspaceId: string, projectId: string) =>
      request<unknown[]>(`/workspaces/${workspaceId}/projects/${projectId}/research-signals`),

    getResearchSignal: (workspaceId: string, projectId: string, sigId: string) =>
      request<unknown>(`/workspaces/${workspaceId}/projects/${projectId}/research-signals/${sigId}`),

    listIcpProfiles: (workspaceId: string, projectId: string) =>
      request<unknown[]>(`/workspaces/${workspaceId}/projects/${projectId}/icp-profiles`),

    getIcpProfile: (workspaceId: string, projectId: string, icpId: string) =>
      request<unknown>(`/workspaces/${workspaceId}/projects/${projectId}/icp-profiles/${icpId}`),

    listMarketSizingReports: (workspaceId: string, projectId: string) =>
      request<unknown[]>(`/workspaces/${workspaceId}/projects/${projectId}/market-sizing-reports`),

    getMarketSizingReport: (workspaceId: string, projectId: string, reportId: string) =>
      request<unknown>(
        `/workspaces/${workspaceId}/projects/${projectId}/market-sizing-reports/${reportId}`
      ),

    listPlaybooks: (workspaceId: string, projectId: string, campaignId: string) =>
      request<unknown[]>(
        `/workspaces/${workspaceId}/projects/${projectId}/campaigns/${campaignId}/playbooks`
      ),

    getPlaybook: (workspaceId: string, projectId: string, campaignId: string, pbId: string) =>
      request<unknown>(
        `/workspaces/${workspaceId}/projects/${projectId}/campaigns/${campaignId}/playbooks/${pbId}`
      ),

    approvePlaybook: (workspaceId: string, projectId: string, campaignId: string, pbId: string) =>
      request<unknown>(
        `/workspaces/${workspaceId}/projects/${projectId}/campaigns/${campaignId}/playbooks/${pbId}/approve`,
        { method: 'PATCH' }
      ),

    exportPlaybook: (
      workspaceId: string,
      projectId: string,
      campaignId: string,
      pbId: string,
      format: 'markdown' | 'json' = 'json'
    ) =>
      request<unknown>(
        `/workspaces/${workspaceId}/projects/${projectId}/campaigns/${campaignId}/playbooks/${pbId}/export?format=${format}`
      ),
  },

  admin: {
    getStats: () =>
      request<{
        total_organisations: number
        total_users: number
        total_agent_runs: number
        total_credits_used: number
      }>('/admin/stats'),

    listOrganisations: () =>
      request<Array<{ id: string; name: string; org_type: string; credit_balance: number; credit_cap: number; created_at: string; workspaces: Array<{ id: string }> }>>('/admin/organisations'),

    listUsers: () =>
      request<Array<{ id: string; email: string; full_name: string | null; role: string; org_id: string | null; created_at: string }>>('/admin/users'),
  },

  credits: {
    getOrgCredits: (orgId: string) =>
      request<{
        org: { credit_balance: number; credit_cap: number }
        ledger: Array<{ workspace_id: string; action_type: string; credits_used: number; created_at: string }>
      }>(`/organisations/${orgId}/credits`),

    getWorkspaceCredits: (workspaceId: string) =>
      request<{
        ledger: Array<{ action_type: string; credits_used: number; created_at: string; agent_run_id: string }>
      }>(`/workspaces/${workspaceId}/credits`),
  },
}
