// ============================================================
// Shared TypeScript types — imported by frontend and backend
// Do NOT import from agent-service (Python)
// ============================================================

// ---- Enums ----

export type OrgType = 'agency' | 'brand'
export type UserRole = 'org_admin' | 'workspace_member' | 'super_admin'
export type UserStatus = 'active' | 'suspended' | 'invited'
export type AgentMode = 'approval_gated' | 'autonomous'
export type AgentRunStatus = 'queued' | 'running' | 'complete' | 'failed'
export type AgentType = 'research' | 'architect' | 'builder' | 'analyst' | 'vault_ingest' | 'icp' | 'market_sizing'
export type VaultDocStatus = 'queued' | 'processing' | 'ready' | 'failed'
export type VaultSourceType = 'pdf' | 'url' | 'free_text' | 'google_drive' | 'notion'
export type CampaignGoal = 'awareness' | 'leads' | 'pipeline' | 'retention'
export type CampaignChannel = 'linkedin' | 'google_search' | 'google_display' | 'meta' | 'email'
export type PlaybookStatus = 'draft' | 'approved' | 'archived'
export type CreditActionType = 'research_run' | 'architect_run' | 'vault_ingest' | 'icp_run' | 'market_sizing_run'
export type ProjectStatus = 'active' | 'archived'
export type CampaignStatus = 'active' | 'completed' | 'archived'
export type IntegrationProvider = 'google_drive' | 'notion'
export type IntegrationStatus = 'connected' | 'disconnected' | 'error'

// ---- Core entities ----

export interface Organisation {
  id: string
  name: string
  org_type: OrgType
  credit_balance: number
  credit_cap: number
  stripe_customer_id: string | null
  created_at: string
  updated_at: string
}

export interface Workspace {
  id: string
  org_id: string
  name: string
  description: string | null
  agent_mode: AgentMode
  credit_soft_cap: number | null
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: UserRole
  status: UserStatus
  org_id: string | null
  created_at: string
  updated_at: string
}

export interface WorkspaceMember {
  id: string
  workspace_id: string
  profile_id: string
  role: UserRole
  created_at: string
}

// ---- Projects & Campaigns ----
// Project = reusable knowledge container (Research/ICP/Market Sizing live here,
// shared across every Campaign underneath it). Campaign = an individual
// execution push (Architect Agent runs here). Both soft-delete via
// status = 'archived' — there is no hard-delete endpoint for either.

export interface Project {
  id: string
  workspace_id: string
  name: string
  description: string | null
  status: ProjectStatus
  created_by: string
  created_at: string
  updated_at: string
}

export interface Campaign {
  id: string
  workspace_id: string
  project_id: string
  name: string
  campaign_goal: CampaignGoal
  channels: CampaignChannel[]
  status: CampaignStatus
  created_by: string
  created_at: string
  updated_at: string
}

// ---- Brand Voice Vault ----

export interface VaultDocument {
  id: string
  workspace_id: string
  name: string
  source_type: VaultSourceType
  file_path: string | null
  file_size_bytes: number | null
  status: VaultDocStatus
  error_message: string | null
  chunk_count: number | null
  created_by: string
  created_at: string
  updated_at: string
  integration_id: string | null
  external_file_id: string | null
  external_file_url: string | null
}

// Status-only view of a workspace's Drive/Notion connection. The
// access_token_encrypted / refresh_token_encrypted / token_expires_at
// columns are NOT selectable by the authenticated Postgres role (see
// docs/Lucid_v2_schema.sql — column-level GRANT) and so must never appear
// here: any route that forwards the caller's own JWT literally cannot read
// them, and any route using the service-role key must not leak them to the
// frontend either.
export interface WorkspaceIntegration {
  id: string
  workspace_id: string
  provider: IntegrationProvider
  status: IntegrationStatus
  external_account_id: string | null
  external_account_label: string | null
  scopes: string[]
  connected_by: string
  connected_at: string
  last_synced_at: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

// ---- Agent Runs ----

export interface AgentRun {
  id: string
  workspace_id: string
  project_id: string | null
  campaign_id: string | null
  agent_type: AgentType
  status: AgentRunStatus
  job_id: string | null
  input_payload: Record<string, unknown>
  error_message: string | null
  credits_used: number
  started_at: string | null
  completed_at: string | null
  triggered_by: string
  created_at: string
}

// ---- Research Agent ----
// (renamed + broadened from v1.0's Intel Agent — schema itself is
// unchanged from v1.0's Market Signal, just project-scoped now)

export interface CompetitorProfile {
  url: string
  key_messaging: string[]
  target_audience: string
  content_themes: string[]
  primary_cta: string
}

export interface ResearchSignal {
  id: string
  workspace_id: string
  project_id: string
  agent_run_id: string
  competitors_analysed: string[]
  competitor_profiles: CompetitorProfile[]
  market_gaps: string[]
  intent_triggers: string[]
  recommended_angles: string[]
  sources: string[]
  created_at: string
}

// ---- ICP Agent ----

export interface IcpFirmographics {
  company_size: string
  industry: string[]
  revenue_range: string
  geography: string[]
}

export interface IcpPersona {
  title: string
  department: string
  seniority: string
  pain_points: string[]
  buying_triggers: string[]
  decision_role: string
}

export interface IcpProfile {
  id: string
  workspace_id: string
  project_id: string
  agent_run_id: string
  research_signal_id: string | null
  firmographics: IcpFirmographics
  personas: IcpPersona[]
  pain_points: string[]
  buying_triggers: string[]
  sources: string[]
  created_at: string
}

// ---- Market Sizing Agent ----

export interface MarketSizeEstimate {
  value: string
  currency: string
  methodology: string
  assumptions: string[]
}

export interface MarketSizingReport {
  id: string
  workspace_id: string
  project_id: string
  agent_run_id: string
  research_signal_id: string | null
  tam_estimate: MarketSizeEstimate
  sam_estimate: MarketSizeEstimate
  som_estimate: MarketSizeEstimate
  methodology_notes: string
  sources: string[]
  created_at: string
}

// ---- Architect Agent ----
// playbook_content shape matches what generate_node.py (agent-service)
// actually emits and campaign_playbooks.playbook_content actually stores —
// code is ground truth here, this previously described a different,
// never-implemented shape (nested per-channel objects with ad copy
// variants). See docs/Lucid_v2_PRD_MVP1.md §12 migration notes.

export interface MessagingFramework {
  primary_message: string
  proof_points: string[]
  cta: string
}

export interface ChannelPlan {
  channel: CampaignChannel
  objective: string
  content_themes: string[]
  kpis: string[]
}

export interface PlaybookContent {
  executive_summary: string
  messaging_framework: MessagingFramework
  channel_plans: ChannelPlan[]
  differentiation: string
  risk_flags: string[]
}

export interface CampaignPlaybook {
  id: string
  workspace_id: string
  project_id: string
  campaign_id: string
  agent_run_id: string
  research_signal_id: string | null
  icp_profile_id: string | null
  market_sizing_report_id: string | null
  campaign_goal: CampaignGoal
  channels: CampaignChannel[]
  winning_angle: string
  target_persona: string
  playbook_content: PlaybookContent
  status: PlaybookStatus
  approved_by: string | null
  approved_at: string | null
  version: number
  created_at: string
  updated_at: string
}

// ---- Credit Ledger ----

export interface CreditLedgerEntry {
  id: string
  org_id: string
  workspace_id: string
  profile_id: string
  agent_run_id: string | null
  action_type: CreditActionType
  credits_used: number
  created_at: string
}

// ---- Redis Job ----

export interface RedisJob {
  job_id: string
  job_type: 'research_run' | 'icp_run' | 'market_sizing_run' | 'architect_run' | 'vault_ingest'
  workspace_id: string
  org_id: string
  payload: Record<string, unknown>
  created_at: string
  priority: number
}

// ---- API response helpers ----

export interface ApiError {
  error: string
  code: string
}

export interface PaginatedResponse<T> {
  data: T[]
  count: number
}
