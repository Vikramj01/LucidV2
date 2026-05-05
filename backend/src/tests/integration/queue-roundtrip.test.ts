/**
 * Integration test: Redis queue → agent_runs DB round-trip.
 *
 * Verifies the full path for triggering an Intel Agent run:
 *   1. POST /api/workspaces/:id/agents/intel/run
 *   2. agent_runs row created in Supabase with status 'queued'
 *   3. Job appears in Upstash Redis queue
 *
 * Run with:
 *   TEST_JWT=<supabase_jwt> \
 *   TEST_WORKSPACE_ID=<workspace_uuid> \
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   UPSTASH_REDIS_URL=... UPSTASH_REDIS_TOKEN=... \
 *   npx ts-node src/tests/integration/queue-roundtrip.test.ts
 *
 * Skips gracefully if env vars are not set.
 */
import { createClient } from '@supabase/supabase-js'
import { Redis } from '@upstash/redis'

const API_BASE = process.env.TEST_API_URL ?? 'http://localhost:3001/api'
const JWT = process.env.TEST_JWT
const WORKSPACE_ID = process.env.TEST_WORKSPACE_ID
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const UPSTASH_REDIS_URL = process.env.UPSTASH_REDIS_URL
const UPSTASH_REDIS_TOKEN = process.env.UPSTASH_REDIS_TOKEN

async function run() {
  if (!JWT || !WORKSPACE_ID || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY ||
      !UPSTASH_REDIS_URL || !UPSTASH_REDIS_TOKEN) {
    console.log('⚠  Skipping integration test — set TEST_JWT, TEST_WORKSPACE_ID and all service env vars to run')
    return
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const redis = new Redis({ url: UPSTASH_REDIS_URL, token: UPSTASH_REDIS_TOKEN })

  const queueKey = 'lucid:jobs'

  // ── Step 1: drain any leftover jobs from previous test runs ──
  const beforeLen = await redis.llen(queueKey)

  // ── Step 2: POST intel/run via the API ──
  console.log('→ POST /agents/intel/run ...')
  const res = await fetch(`${API_BASE}/workspaces/${WORKSPACE_ID}/agents/intel/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${JWT}`,
    },
    body: JSON.stringify({
      competitor_urls: ['https://example.com'],
      industry_keywords: 'B2B SaaS marketing',
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error(`✗ API returned ${res.status}:`, body)
    process.exit(1)
  }

  const { id: runId, status, job_id } = (await res.json()) as { id: string; status: string; job_id: string }
  console.log(`✓ agent_run created: id=${runId}, status=${status}, job_id=${job_id}`)

  if (status !== 'queued') {
    console.error(`✗ Expected status 'queued', got '${status}'`)
    process.exit(1)
  }

  // ── Step 3: verify agent_runs row in Supabase ──
  const { data: run, error } = await supabase
    .from('agent_runs')
    .select('id, status, agent_type, workspace_id, job_id')
    .eq('id', runId)
    .single()

  if (error || !run) {
    console.error('✗ agent_run not found in Supabase:', error?.message)
    process.exit(1)
  }

  console.log('✓ agent_run confirmed in Supabase:', run)

  if (run.status !== 'queued') {
    console.error(`✗ DB status is '${run.status}', expected 'queued'`)
    process.exit(1)
  }
  if (run.workspace_id !== WORKSPACE_ID) {
    console.error(`✗ workspace_id mismatch: got ${run.workspace_id}`)
    process.exit(1)
  }

  // ── Step 4: verify job landed in Redis ──
  const afterLen = await redis.llen(queueKey)
  if (afterLen <= beforeLen) {
    console.error(`✗ Redis queue length did not increase (before=${beforeLen}, after=${afterLen})`)
    process.exit(1)
  }
  console.log(`✓ Redis queue grew from ${beforeLen} → ${afterLen} items`)

  // Peek at the last job to verify structure
  const raw = await redis.lindex(queueKey, -1)
  if (raw) {
    const job = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (job.job_type !== 'intel_run') {
      console.error(`✗ Job type mismatch: got '${job.job_type}'`)
      process.exit(1)
    }
    if (job.workspace_id !== WORKSPACE_ID) {
      console.error(`✗ Job workspace_id mismatch`)
      process.exit(1)
    }
    console.log('✓ Redis job structure valid:', {
      job_id: job.job_id,
      job_type: job.job_type,
      workspace_id: job.workspace_id,
    })
  }

  // ── Cleanup: remove the test agent_run ──
  await supabase.from('agent_runs').delete().eq('id', runId)
  console.log('✓ Cleaned up test agent_run')

  console.log('\n✅ All integration checks passed')
}

run().catch(err => {
  console.error('Integration test error:', err)
  process.exit(1)
})
