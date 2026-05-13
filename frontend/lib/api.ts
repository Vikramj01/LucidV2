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

// ---- Organisations ----

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

  agents: {
    runIntel: (
      workspaceId: string,
      body: { competitor_urls: string[]; industry_keywords?: string }
    ) =>
      request<{ id: string; status: string; job_id: string }>(
        `/workspaces/${workspaceId}/agents/intel/run`,
        { method: 'POST', body }
      ),

    runArchitect: (
      workspaceId: string,
      body: { market_signal_id?: string; campaign_goal: string; channels: string[] }
    ) =>
      request<{ id: string; status: string; job_id: string }>(
        `/workspaces/${workspaceId}/agents/architect/run`,
        { method: 'POST', body }
      ),

    listRuns: (workspaceId: string) =>
      request<unknown[]>(`/workspaces/${workspaceId}/agent-runs`),

    getRun: (workspaceId: string, runId: string) =>
      request<unknown>(`/workspaces/${workspaceId}/agent-runs/${runId}`),
  },

  outputs: {
    listSignals: (workspaceId: string) =>
      request<unknown[]>(`/workspaces/${workspaceId}/market-signals`),

    getSignal: (workspaceId: string, sigId: string) =>
      request<unknown>(`/workspaces/${workspaceId}/market-signals/${sigId}`),

    listPlaybooks: (workspaceId: string) =>
      request<unknown[]>(`/workspaces/${workspaceId}/playbooks`),

    getPlaybook: (workspaceId: string, pbId: string) =>
      request<unknown>(`/workspaces/${workspaceId}/playbooks/${pbId}`),

    approvePlaybook: (workspaceId: string, pbId: string) =>
      request<unknown>(`/workspaces/${workspaceId}/playbooks/${pbId}/approve`, {
        method: 'PATCH',
      }),

    exportPlaybook: (workspaceId: string, pbId: string, format: 'markdown' | 'json' = 'json') =>
      request<unknown>(`/workspaces/${workspaceId}/playbooks/${pbId}/export?format=${format}`),
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
