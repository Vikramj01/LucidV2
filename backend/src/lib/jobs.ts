import { v4 as uuidv4 } from 'uuid'

const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL ?? 'http://localhost:8000'

const ENDPOINTS: Record<string, string> = {
  intel_run: '/run/intel',
  architect_run: '/run/architect',
  vault_ingest: '/run/vault',
}

export interface RedisJob {
  job_id: string
  job_type: 'intel_run' | 'architect_run' | 'vault_ingest'
  workspace_id: string
  org_id: string
  payload: Record<string, unknown>
  created_at: string
  priority: number
}

/**
 * Triggers an agent job by POSTing to the agent-service HTTP endpoint.
 * Returns immediately with 202 Accepted — the agent runs in the background.
 */
export async function enqueueJob(
  job_type: RedisJob['job_type'],
  workspace_id: string,
  org_id: string,
  payload: Record<string, unknown>
): Promise<string> {
  const job_id = uuidv4()

  const body: RedisJob = {
    job_id,
    job_type,
    workspace_id,
    org_id,
    payload,
    created_at: new Date().toISOString(),
    priority: 1,
  }

  const res = await fetch(`${AGENT_SERVICE_URL}${ENDPOINTS[job_type]}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Agent service error ${res.status}: ${text}`)
  }

  return job_id
}
