import { v4 as uuidv4 } from 'uuid'
import { getRedis, QUEUE_KEY } from './redis'

export interface RedisJob {
  job_id: string
  job_type: 'intel_run' | 'architect_run' | 'vault_ingest'
  workspace_id: string
  org_id: string
  payload: Record<string, unknown>
  created_at: string
  priority: number
}

export async function enqueueJob(
  job_type: RedisJob['job_type'],
  workspace_id: string,
  org_id: string,
  payload: Record<string, unknown>
): Promise<string> {
  const job: RedisJob = {
    job_id: uuidv4(),
    job_type,
    workspace_id,
    org_id,
    payload,
    created_at: new Date().toISOString(),
    priority: 1,
  }
  await getRedis().rpush(QUEUE_KEY, JSON.stringify(job))
  return job.job_id
}
