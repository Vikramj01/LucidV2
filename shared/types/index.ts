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
export type AgentType = 'research' | 'architect' | 'icp' | 'market_sizing' | 'builder' | 'analyst' | 'vault_ingest'
export type VaultDocStatus = 'queued' | 'processing' | 'ready' | 'failed'
export type VaultSourceType = 'pdf' | 'url' | 'free_text' | 'google_drive' | 'notion'
export type CampaignGoal = 'awareness' | 'leads' | 'pipeline' | 'retention'
export type CampaignChannel = 'linkedin' | 'google_search' | 'google_display' | 'meta' | 'email'
export type PlaybookStatus = 'draft' | 'approved' | 'archived'
export type CreditActionType = 'research_run' | 'architect_run' | 'icp_run' | 'market_sizing_run' | 'vault_ingest'
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
  integration_id: string | null
  external_file_id: string | null
  external_file_url: string | null
  status: VaultDocStatus
  error_message: string | null
  chunk_count: number | null
  created_by: string
  created_at: string
  updated_at: string
}

// Safe, RLS-exposed view of a workspace integration — never include the
// token fields here, they must never round-trip into a shared type that
// both frontend and backend import.
export interface WorkspaceIntegrationPublic {
  id: string
  workspace_id: string
  provider: IntegrationProvider
  status: IntegrationStatus
  external_account_label: string | null
  connected_at: string
  last_synced_at: string | null
  error_message: string | null
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

// Shape matches agent-service/app/nodes/research/extract_node.py, the
// actual shipped output — not a guessed shape.
export interface CompetitorProfile {
  name: string
  url: string
  positioning: string
  key_messages: string[]
  icp: string
  weaknesses: string[]
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
// Shape matches agent-service/app/nodes/architect/generate_node.py, the
// actual shipped output — not the ad_copy_variants/campaign_phases shape
// this used to document, which was never what the agent produced.

export interface MessagingFramework {
  primary_message: string
  proof_points: string[]
  cta: string
}

export interface ChannelPlan {
  channel: string
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
