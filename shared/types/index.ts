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
export type AgentType = 'intel' | 'architect' | 'builder' | 'analyst' | 'vault_ingest'
export type VaultDocStatus = 'queued' | 'processing' | 'ready' | 'failed'
export type VaultSourceType = 'pdf' | 'url' | 'free_text'
export type CampaignGoal = 'awareness' | 'leads' | 'pipeline' | 'retention'
export type CampaignChannel = 'linkedin' | 'google_search' | 'google_display' | 'meta' | 'email'
export type PlaybookStatus = 'draft' | 'approved' | 'archived'
export type CreditActionType = 'intel_run' | 'architect_run' | 'vault_ingest'

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
}

// ---- Agent Runs ----

export interface AgentRun {
  id: string
  workspace_id: string
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

// ---- Intel Agent ----

export interface CompetitorProfile {
  url: string
  key_messaging: string[]
  target_audience: string
  content_themes: string[]
  primary_cta: string
}

export interface MarketSignal {
  id: string
  workspace_id: string
  agent_run_id: string
  competitors_analysed: string[]
  competitor_profiles: CompetitorProfile[]
  market_gaps: string[]
  intent_triggers: string[]
  recommended_angles: string[]
  sources: string[]
  created_at: string
}

// ---- Architect Agent ----

export interface AdCopyVariant {
  format: string
  headline: string
  body: string
  cta: string
}

export interface CampaignPhase {
  phase: string
  budget_pct: number
  duration_days: number
}

export interface MessagingFramework {
  hero_message: string
  supporting_points: string[]
  proof_points: string[]
}

export interface SuccessMetric {
  kpi: string
  target: string
}

export interface ChannelPlaybook {
  strategy_rationale: string
  campaign_phases: CampaignPhase[]
  messaging_framework: MessagingFramework
  ad_copy_variants: AdCopyVariant[]
  success_metrics: SuccessMetric[]
}

export interface PlaybookContent {
  channels: Partial<Record<CampaignChannel, ChannelPlaybook>>
  sources: string[]
}

export interface CampaignPlaybook {
  id: string
  workspace_id: string
  agent_run_id: string
  market_signal_id: string | null
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
  job_type: 'intel_run' | 'architect_run' | 'vault_ingest'
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
