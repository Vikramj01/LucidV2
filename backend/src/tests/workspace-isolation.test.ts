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
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!

// These should be real user JWTs from two separate orgs/workspaces
const USER_A_JWT = process.env.TEST_USER_A_JWT
const USER_B_JWT = process.env.TEST_USER_B_JWT
const WORKSPACE_B_ID = process.env.TEST_WORKSPACE_B_ID

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

  // Attempt to read Workspace B's research_signals as User A
  const { data, error } = await clientA
    .from('research_signals')
    .select('*')
    .eq('workspace_id', WORKSPACE_B_ID)

  if (error) {
    console.log('✓ RLS blocked cross-workspace read (returned error):', error.message)
  } else if (!data || data.length === 0) {
    console.log('✓ RLS blocked cross-workspace read (returned empty array)')
  } else {
    console.error('✗ ISOLATION FAILURE: User A could read Workspace B data!', data)
    process.exit(1)
  }

  // Same check for vault_documents
  const { data: vaultData } = await clientA
    .from('vault_documents')
    .select('*')
    .eq('workspace_id', WORKSPACE_B_ID)

  if (!vaultData || vaultData.length === 0) {
    console.log('✓ RLS blocked cross-workspace vault_documents read')
  } else {
    console.error('✗ ISOLATION FAILURE: User A could read Workspace B vault documents!', vaultData)
    process.exit(1)
  }

  // Same check for campaign_playbooks
  const { data: pbData } = await clientA
    .from('campaign_playbooks')
    .select('*')
    .eq('workspace_id', WORKSPACE_B_ID)

  if (!pbData || pbData.length === 0) {
    console.log('✓ RLS blocked cross-workspace campaign_playbooks read')
  } else {
    console.error('✗ ISOLATION FAILURE: User A could read Workspace B playbooks!', pbData)
    process.exit(1)
  }

  // Same check for projects — the new reusable-knowledge container
  const { data: projectData } = await clientA
    .from('projects')
    .select('*')
    .eq('workspace_id', WORKSPACE_B_ID)

  if (!projectData || projectData.length === 0) {
    console.log('✓ RLS blocked cross-workspace projects read')
  } else {
    console.error('✗ ISOLATION FAILURE: User A could read Workspace B projects!', projectData)
    process.exit(1)
  }

  // Same check for campaigns
  const { data: campaignData } = await clientA
    .from('campaigns')
    .select('*')
    .eq('workspace_id', WORKSPACE_B_ID)

  if (!campaignData || campaignData.length === 0) {
    console.log('✓ RLS blocked cross-workspace campaigns read')
  } else {
    console.error('✗ ISOLATION FAILURE: User A could read Workspace B campaigns!', campaignData)
    process.exit(1)
  }

  // Same check for icp_profiles
  const { data: icpData } = await clientA
    .from('icp_profiles')
    .select('*')
    .eq('workspace_id', WORKSPACE_B_ID)

  if (!icpData || icpData.length === 0) {
    console.log('✓ RLS blocked cross-workspace icp_profiles read')
  } else {
    console.error('✗ ISOLATION FAILURE: User A could read Workspace B ICP profiles!', icpData)
    process.exit(1)
  }

  // Same check for market_sizing_reports
  const { data: sizingData } = await clientA
    .from('market_sizing_reports')
    .select('*')
    .eq('workspace_id', WORKSPACE_B_ID)

  if (!sizingData || sizingData.length === 0) {
    console.log('✓ RLS blocked cross-workspace market_sizing_reports read')
  } else {
    console.error('✗ ISOLATION FAILURE: User A could read Workspace B market sizing reports!', sizingData)
    process.exit(1)
  }

  // workspace_integrations: even the safe columns must not leak cross-workspace,
  // and the token columns must be unreachable regardless of workspace.
  const { data: integrationData, error: integrationError } = await clientA
    .from('workspace_integrations')
    .select('*')
    .eq('workspace_id', WORKSPACE_B_ID)

  if (integrationError) {
    console.log('✓ RLS/column grants blocked cross-workspace workspace_integrations read (returned error):', integrationError.message)
  } else if (!integrationData || integrationData.length === 0) {
    console.log('✓ RLS blocked cross-workspace workspace_integrations read')
  } else {
    console.error('✗ ISOLATION FAILURE: User A could read Workspace B integrations!', integrationData)
    process.exit(1)
  }

  // Column-level check: even for an integration row a user CAN see (their own
  // workspace's), the token columns must never come back. This is the concrete
  // test for the REVOKE/GRANT column lockdown described in the Phase 1 migration.
  const { data: ownIntegrations } = await clientA.from('workspace_integrations_public').select('*')
  if (ownIntegrations) {
    for (const row of ownIntegrations) {
      if ('access_token_encrypted' in row || 'refresh_token_encrypted' in row) {
        console.error('✗ ISOLATION FAILURE: token columns are reachable via workspace_integrations_public!', row)
        process.exit(1)
      }
    }
    console.log('✓ workspace_integrations_public never exposes token columns')
  }

  console.log('\n✓ All isolation checks passed')
}

runIsolationTest().catch(err => {
  console.error('Test error:', err)
  process.exit(1)
})
