/**
 * Workspace isolation test.
 *
 * Verifies that RLS prevents a user in Workspace A from reading
 * data belonging to Workspace B — even with a valid JWT.
 *
 * Run with: npx ts-node src/tests/workspace-isolation.test.ts
 * Requires SUPABASE_URL and SUPABASE_ANON_KEY set in environment.
 * Two test user JWTs must be provided via env vars below.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!

// These should be real user JWTs from two separate orgs/workspaces
const USER_A_JWT = process.env.TEST_USER_A_JWT
const USER_B_JWT = process.env.TEST_USER_B_JWT
const WORKSPACE_B_ID = process.env.TEST_WORKSPACE_B_ID

async function checkBlocked(
  clientA: SupabaseClient,
  table: string,
  filterColumn: string,
  workspaceBId: string
): Promise<boolean> {
  const { data, error } = await clientA
    .from(table)
    .select('*')
    .eq(filterColumn, workspaceBId)

  if (error) {
    console.log(`✓ RLS blocked cross-workspace ${table} read (returned error):`, error.message)
    return true
  }
  if (!data || data.length === 0) {
    console.log(`✓ RLS blocked cross-workspace ${table} read (returned empty array)`)
    return true
  }
  console.error(`✗ ISOLATION FAILURE: User A could read Workspace B ${table}!`, data)
  return false
}

async function runIsolationTest(): Promise<void> {
  if (!USER_A_JWT || !USER_B_JWT || !WORKSPACE_B_ID) {
    console.log('Skipping isolation test: TEST_USER_A_JWT, TEST_USER_B_JWT, TEST_WORKSPACE_B_ID not set')
    console.log('Set these env vars with real user JWTs to run a live isolation check')
    return
  }

  // Client authenticated as User A
  const clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${USER_A_JWT}` } },
    auth: { persistSession: false },
  })

  // Tables scoped directly by workspace_id
  const workspaceScopedTables: [table: string, column: string][] = [
    ['research_signals', 'workspace_id'],
    ['icp_profiles', 'workspace_id'],
    ['market_sizing_reports', 'workspace_id'],
    ['vault_documents', 'workspace_id'],
    ['campaign_playbooks', 'workspace_id'],
    ['projects', 'workspace_id'],
    ['campaigns', 'workspace_id'],
  ]

  let allPassed = true
  for (const [table, column] of workspaceScopedTables) {
    const passed = await checkBlocked(clientA, table, column, WORKSPACE_B_ID)
    allPassed = allPassed && passed
  }

  if (!allPassed) {
    process.exit(1)
  }

  console.log('\n✓ All isolation checks passed')
}

runIsolationTest().catch(err => {
  console.error('Test error:', err)
  process.exit(1)
})
