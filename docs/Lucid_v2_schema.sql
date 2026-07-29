-- ============================================================
-- Lucid v2 — Supabase Database Schema
-- MVP1: Research Agent + ICP Agent + Market Sizing Agent +
--       Architect Agent + Brand Voice Vault (incl. Drive/Notion)
-- ============================================================
-- This is the canonical DDL for a FRESH environment. For an existing
-- environment that already has the v1.0 schema (Intel + Architect only,
-- flat under Workspace), do NOT run this file directly — apply
-- docs/migrations/001_enum_changes.sql, then 002_project_campaign_schema.sql,
-- then 003_backfill.sql instead, in that order.
-- Run in order. Enable pgvector extension first.
-- ============================================================

-- EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE org_type AS ENUM ('agency', 'brand');
CREATE TYPE user_role AS ENUM ('org_admin', 'workspace_member', 'super_admin');
CREATE TYPE user_status AS ENUM ('active', 'suspended', 'invited');
CREATE TYPE agent_mode AS ENUM ('approval_gated', 'autonomous');
CREATE TYPE ui_theme AS ENUM ('dark', 'light');
CREATE TYPE agent_run_status AS ENUM ('queued', 'running', 'complete', 'failed');
CREATE TYPE agent_type AS ENUM ('research', 'architect', 'icp', 'market_sizing', 'builder', 'analyst', 'vault_ingest');
CREATE TYPE vault_doc_status AS ENUM ('queued', 'processing', 'ready', 'failed');
CREATE TYPE vault_source_type AS ENUM ('pdf', 'url', 'free_text', 'google_drive', 'notion');
CREATE TYPE campaign_goal AS ENUM ('awareness', 'leads', 'pipeline', 'retention');
CREATE TYPE campaign_channel AS ENUM ('linkedin', 'google_search', 'google_display', 'meta', 'email');
CREATE TYPE playbook_status AS ENUM ('draft', 'approved', 'archived');
CREATE TYPE credit_action_type AS ENUM ('research_run', 'architect_run', 'icp_run', 'market_sizing_run', 'vault_ingest');
CREATE TYPE project_status AS ENUM ('active', 'archived');
CREATE TYPE campaign_status AS ENUM ('active', 'completed', 'archived');
CREATE TYPE integration_provider AS ENUM ('google_drive', 'notion');
CREATE TYPE integration_status AS ENUM ('connected', 'disconnected', 'error');

-- ============================================================
-- CORE TABLES
-- ============================================================

-- ORGANISATIONS
-- Top-level tenant. Holds billing relationship and credit pool.
CREATE TABLE organisations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  org_type        org_type NOT NULL DEFAULT 'brand',
  credit_balance  INTEGER NOT NULL DEFAULT 100,       -- starting credits
  credit_cap      INTEGER NOT NULL DEFAULT 1000,      -- monthly allocation
  stripe_customer_id TEXT,                            -- Phase 2
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- WORKSPACES
-- One per client brand. Brand Voice Vault and integrations live here —
-- they're brand-wide constants, shared across every Project/Campaign.
CREATE TABLE workspaces (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  agent_mode      agent_mode NOT NULL DEFAULT 'approval_gated',
  credit_soft_cap INTEGER,                            -- optional per-workspace limit (NULL = no cap)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PROFILES
-- One per authenticated user. Linked to Supabase Auth via id = auth.uid().
CREATE TABLE profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  full_name       TEXT,
  avatar_url      TEXT,
  role            user_role NOT NULL DEFAULT 'workspace_member',
  status          user_status NOT NULL DEFAULT 'active',
  org_id          UUID REFERENCES organisations(id) ON DELETE SET NULL,
  ui_theme        ui_theme NOT NULL DEFAULT 'dark',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- WORKSPACE MEMBERS
-- Junction table. Controls which profiles can access which workspaces.
CREATE TABLE workspace_members (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role            user_role NOT NULL DEFAULT 'workspace_member',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, profile_id)
);

-- ============================================================
-- PROJECTS & CAMPAIGNS
-- Project is the reusable knowledge container (Research/ICP/Market
-- Sizing live here, shared across every Campaign underneath it).
-- Campaign is an individual execution push with its own goal/channels;
-- the Architect Agent runs at this level.
-- ============================================================

CREATE TABLE projects (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  status          project_status NOT NULL DEFAULT 'active',
  created_by      UUID NOT NULL REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX projects_workspace_idx ON projects(workspace_id);

CREATE TABLE campaigns (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  campaign_goal   campaign_goal NOT NULL,
  channels        campaign_channel[] NOT NULL DEFAULT '{}',
  status          campaign_status NOT NULL DEFAULT 'active',
  created_by      UUID NOT NULL REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX campaigns_workspace_idx ON campaigns(workspace_id);
CREATE INDEX campaigns_project_idx ON campaigns(project_id);

-- ============================================================
-- BRAND VOICE VAULT
-- ============================================================

-- WORKSPACE INTEGRATIONS
-- Google Drive / Notion OAuth connections. Token columns must NEVER be
-- selectable by the `authenticated` role — see RLS section below.
CREATE TABLE workspace_integrations (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id             UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider                 integration_provider NOT NULL,
  status                   integration_status NOT NULL DEFAULT 'connected',
  access_token_encrypted   TEXT NOT NULL,
  refresh_token_encrypted  TEXT,
  token_expires_at         TIMESTAMPTZ,
  external_account_id      TEXT,
  external_account_label   TEXT,
  scopes                   TEXT[] NOT NULL DEFAULT '{}',
  connected_by             UUID NOT NULL REFERENCES profiles(id),
  connected_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at           TIMESTAMPTZ,
  error_message            TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, provider)
);

CREATE INDEX workspace_integrations_workspace_idx ON workspace_integrations(workspace_id);

-- Safe view for the frontend: connection status only, never token material.
-- security_invoker is required so this runs as the querying role and the
-- RLS policy on the base table (see RLS POLICIES section) actually applies
-- to it — without it, the view would execute with its owner's privileges
-- and could bypass RLS entirely. Note RLS policies can only attach to
-- tables, not views — CREATE POLICY on this view would fail; it inherits
-- its access control from the base table's policy via security_invoker.
CREATE VIEW workspace_integrations_public
  WITH (security_invoker = true) AS
  SELECT id, workspace_id, provider, status, external_account_label,
         connected_at, last_synced_at, error_message
  FROM workspace_integrations;

-- VAULT DOCUMENTS
-- Metadata record for each ingested document.
CREATE TABLE vault_documents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  source_type       vault_source_type NOT NULL,
  file_path         TEXT,                             -- Supabase Storage path (PDF)
  file_size_bytes   INTEGER,
  integration_id    UUID REFERENCES workspace_integrations(id),
  external_file_id  TEXT,                              -- Drive file id / Notion page id
  external_file_url TEXT,
  status            vault_doc_status NOT NULL DEFAULT 'queued',
  error_message     TEXT,
  chunk_count       INTEGER,                            -- populated after ingestion
  created_by        UUID NOT NULL REFERENCES profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- VAULT CHUNKS
-- Individual text chunks with vector embeddings. Powers RAG retrieval.
CREATE TABLE vault_chunks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id     UUID NOT NULL REFERENCES vault_documents(id) ON DELETE CASCADE,
  chunk_index     INTEGER NOT NULL,
  content         TEXT NOT NULL,
  embedding       vector(1536),                       -- OpenAI text-embedding-3-small dimension
  token_count     INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast cosine similarity search
CREATE INDEX vault_chunks_embedding_idx
  ON vault_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Index for workspace filtering (always filter by workspace before vector search)
CREATE INDEX vault_chunks_workspace_idx ON vault_chunks(workspace_id);

-- ============================================================
-- AGENT RUNS
-- Source of truth for Mission Control status display.
-- research/icp/market_sizing runs are project-scoped only; architect
-- runs are project+campaign-scoped; vault_ingest/builder/analyst are
-- scoped to neither.
-- ============================================================

CREATE TABLE agent_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
  campaign_id     UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  agent_type      agent_type NOT NULL,
  status          agent_run_status NOT NULL DEFAULT 'queued',
  job_id          TEXT,                               -- Redis job ID
  input_payload   JSONB NOT NULL DEFAULT '{}',        -- what was passed to the agent
  error_message   TEXT,
  credits_used    INTEGER NOT NULL DEFAULT 0,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  triggered_by    UUID NOT NULL REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_runs_scope_check CHECK (
    (agent_type IN ('research', 'icp', 'market_sizing') AND project_id IS NOT NULL AND campaign_id IS NULL)
    OR (agent_type = 'architect' AND project_id IS NOT NULL AND campaign_id IS NOT NULL)
    OR (agent_type IN ('vault_ingest', 'builder', 'analyst') AND project_id IS NULL AND campaign_id IS NULL)
  )
);

CREATE INDEX agent_runs_workspace_idx ON agent_runs(workspace_id);
CREATE INDEX agent_runs_status_idx ON agent_runs(workspace_id, agent_type, status);
CREATE INDEX agent_runs_project_idx ON agent_runs(project_id);
CREATE INDEX agent_runs_campaign_idx ON agent_runs(campaign_id);

-- ============================================================
-- RESEARCH AGENT OUTPUTS
-- ============================================================

CREATE TABLE research_signals (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_run_id          UUID NOT NULL REFERENCES agent_runs(id),
  competitors_analysed  TEXT[] NOT NULL DEFAULT '{}',
  competitor_profiles   JSONB NOT NULL DEFAULT '[]',  -- array of competitor profile objects
  market_gaps           TEXT[] NOT NULL DEFAULT '{}',
  intent_triggers       TEXT[] NOT NULL DEFAULT '{}',
  recommended_angles    TEXT[] NOT NULL DEFAULT '{}',
  sources               TEXT[] NOT NULL DEFAULT '{}', -- cited URLs
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Full research_signals JSONB structure for competitor_profiles:
-- [
--   {
--     "url": "string",
--     "key_messaging": ["string"],
--     "target_audience": "string",
--     "content_themes": ["string"],
--     "primary_cta": "string"
--   }
-- ]

CREATE INDEX research_signals_workspace_idx ON research_signals(workspace_id);
CREATE INDEX research_signals_project_idx ON research_signals(project_id);

-- ============================================================
-- ICP AGENT OUTPUTS
-- ============================================================

CREATE TABLE icp_profiles (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_run_id        UUID NOT NULL REFERENCES agent_runs(id),
  research_signal_id  UUID REFERENCES research_signals(id),
  firmographics       JSONB NOT NULL DEFAULT '{}',   -- { company_size, industry[], revenue_range, geography[] }
  personas            JSONB NOT NULL DEFAULT '[]',   -- [{ title, department, seniority, pain_points[], buying_triggers[], decision_role }]
  pain_points         TEXT[] NOT NULL DEFAULT '{}',
  buying_triggers     TEXT[] NOT NULL DEFAULT '{}',
  sources             TEXT[] NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX icp_profiles_workspace_idx ON icp_profiles(workspace_id);
CREATE INDEX icp_profiles_project_idx ON icp_profiles(project_id);

-- ============================================================
-- MARKET SIZING AGENT OUTPUTS
-- ============================================================

CREATE TABLE market_sizing_reports (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_run_id        UUID NOT NULL REFERENCES agent_runs(id),
  research_signal_id  UUID REFERENCES research_signals(id),
  tam_estimate        JSONB NOT NULL,   -- { value, currency, methodology, assumptions[] }
  sam_estimate        JSONB NOT NULL,
  som_estimate        JSONB NOT NULL,
  methodology_notes   TEXT NOT NULL,
  sources             TEXT[] NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX market_sizing_reports_workspace_idx ON market_sizing_reports(workspace_id);
CREATE INDEX market_sizing_reports_project_idx ON market_sizing_reports(project_id);

-- ============================================================
-- ARCHITECT AGENT OUTPUTS
-- ============================================================

CREATE TABLE campaign_playbooks (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id             UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id               UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,   -- auto-set by trigger from campaign_id
  campaign_id              UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  agent_run_id             UUID NOT NULL REFERENCES agent_runs(id),
  research_signal_id       UUID REFERENCES research_signals(id),
  icp_profile_id           UUID REFERENCES icp_profiles(id),
  market_sizing_report_id  UUID REFERENCES market_sizing_reports(id),
  campaign_goal            campaign_goal NOT NULL,
  channels                 campaign_channel[] NOT NULL DEFAULT '{}',
  winning_angle            TEXT NOT NULL,
  target_persona           TEXT NOT NULL,
  playbook_content         JSONB NOT NULL DEFAULT '{}',      -- full playbook per channel (see below)
  status                   playbook_status NOT NULL DEFAULT 'draft',
  approved_by              UUID REFERENCES profiles(id),
  approved_at              TIMESTAMPTZ,
  version                  INTEGER NOT NULL DEFAULT 1,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Full playbook_content JSONB structure (ground truth: agent-service's
-- generate_node.py — NOT the older ad_copy_variants/campaign_phases
-- shape this comment used to describe):
-- {
--   "executive_summary": "string",
--   "messaging_framework": { "primary_message": "string", "proof_points": ["string"], "cta": "string" },
--   "channel_plans": [{ "channel": "string", "objective": "string", "content_themes": ["string"], "kpis": ["string"] }],
--   "differentiation": "string",
--   "risk_flags": ["string"]
-- }

CREATE INDEX campaign_playbooks_workspace_idx ON campaign_playbooks(workspace_id);
CREATE INDEX campaign_playbooks_status_idx ON campaign_playbooks(workspace_id, status);
CREATE INDEX campaign_playbooks_project_idx ON campaign_playbooks(project_id);
CREATE INDEX campaign_playbooks_campaign_idx ON campaign_playbooks(campaign_id);

-- ============================================================
-- CREDIT LEDGER
-- Append-only log of all credit consumption per workspace.
-- ============================================================

CREATE TABLE credit_ledger (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  profile_id      UUID NOT NULL REFERENCES profiles(id),
  agent_run_id    UUID REFERENCES agent_runs(id),
  action_type     credit_action_type NOT NULL,
  credits_used    INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX credit_ledger_org_idx ON credit_ledger(org_id, created_at);
CREATE INDEX credit_ledger_workspace_idx ON credit_ledger(workspace_id, created_at);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE icp_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_sizing_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- Helper function: get the authenticated user's org_id
CREATE OR REPLACE FUNCTION auth_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check if user is org_admin or super_admin
CREATE OR REPLACE FUNCTION is_org_admin()
RETURNS BOOLEAN AS $$
  SELECT role IN ('org_admin', 'super_admin')
  FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check if user is super_admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT role = 'super_admin'
  FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check if user is a member of a given workspace
CREATE OR REPLACE FUNCTION is_workspace_member(ws_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = ws_id AND profile_id = auth.uid()
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ORGANISATIONS
CREATE POLICY "Users can view their own organisation"
  ON organisations FOR SELECT
  USING (id = auth_org_id() OR is_super_admin());

CREATE POLICY "Org admins can update their organisation"
  ON organisations FOR UPDATE
  USING (id = auth_org_id() AND is_org_admin());

-- WORKSPACES
CREATE POLICY "Org admins see all workspaces in their org"
  ON workspaces FOR SELECT
  USING (
    (org_id = auth_org_id() AND is_org_admin())
    OR is_workspace_member(id)
    OR is_super_admin()
  );

CREATE POLICY "Org admins can create workspaces"
  ON workspaces FOR INSERT
  WITH CHECK (org_id = auth_org_id() AND is_org_admin());

CREATE POLICY "Org admins can update workspaces"
  ON workspaces FOR UPDATE
  USING (org_id = auth_org_id() AND is_org_admin());

-- PROFILES
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid() OR is_org_admin() OR is_super_admin());

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- WORKSPACE MEMBERS
CREATE POLICY "Members can see membership of their workspaces"
  ON workspace_members FOR SELECT
  USING (
    is_workspace_member(workspace_id)
    OR is_org_admin()
    OR is_super_admin()
  );

CREATE POLICY "Org admins can manage workspace members"
  ON workspace_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspaces
      WHERE id = workspace_id AND org_id = auth_org_id()
    ) AND is_org_admin()
  );

-- PROJECTS
CREATE POLICY "Workspace members can view projects"
  ON projects FOR SELECT
  USING (is_workspace_member(workspace_id) OR is_org_admin() OR is_super_admin());

CREATE POLICY "Workspace members can create projects"
  ON projects FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id) OR is_org_admin());

CREATE POLICY "Workspace members can update projects"
  ON projects FOR UPDATE
  USING (is_workspace_member(workspace_id) OR is_org_admin());

-- CAMPAIGNS
CREATE POLICY "Workspace members can view campaigns"
  ON campaigns FOR SELECT
  USING (is_workspace_member(workspace_id) OR is_org_admin() OR is_super_admin());

CREATE POLICY "Workspace members can create campaigns"
  ON campaigns FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id) OR is_org_admin());

CREATE POLICY "Workspace members can update campaigns"
  ON campaigns FOR UPDATE
  USING (is_workspace_member(workspace_id) OR is_org_admin());

-- WORKSPACE INTEGRATIONS
-- Row-level policy restricts *which rows* a workspace member can see.
-- That alone is not enough — RLS filters rows, not columns, so without
-- the REVOKE/GRANT below this same policy would also let a workspace
-- member SELECT access_token_encrypted/refresh_token_encrypted directly.
CREATE POLICY "Workspace members can view integration status"
  ON workspace_integrations FOR SELECT
  USING (is_workspace_member(workspace_id) OR is_org_admin() OR is_super_admin());

-- Column-level lockdown: Supabase grants table-wide SELECT to
-- `authenticated` by default and relies on RLS for row filtering — that
-- default is not safe for a table with token columns. Revoke it and
-- re-grant only the non-secret columns, so even a direct
-- `select('*')` against the base table can never return token material.
REVOKE SELECT ON workspace_integrations FROM authenticated;
GRANT SELECT (
  id, workspace_id, provider, status, external_account_id,
  external_account_label, scopes, connected_by, connected_at,
  last_synced_at, error_message, created_at, updated_at
) ON workspace_integrations TO authenticated;

-- VAULT DOCUMENTS
CREATE POLICY "Workspace members can view vault documents"
  ON vault_documents FOR SELECT
  USING (is_workspace_member(workspace_id) OR is_org_admin() OR is_super_admin());

CREATE POLICY "Workspace members can insert vault documents"
  ON vault_documents FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id) OR is_org_admin());

CREATE POLICY "Workspace members can delete vault documents"
  ON vault_documents FOR DELETE
  USING (is_workspace_member(workspace_id) OR is_org_admin());

-- VAULT CHUNKS (read-only for users — writes come from agent-service via service role)
CREATE POLICY "Workspace members can read vault chunks"
  ON vault_chunks FOR SELECT
  USING (is_workspace_member(workspace_id) OR is_org_admin() OR is_super_admin());

-- AGENT RUNS
CREATE POLICY "Workspace members can view agent runs"
  ON agent_runs FOR SELECT
  USING (is_workspace_member(workspace_id) OR is_org_admin() OR is_super_admin());

CREATE POLICY "Workspace members can insert agent runs"
  ON agent_runs FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id) OR is_org_admin());

-- RESEARCH SIGNALS
CREATE POLICY "Workspace members can view research signals"
  ON research_signals FOR SELECT
  USING (is_workspace_member(workspace_id) OR is_org_admin() OR is_super_admin());

-- ICP PROFILES
CREATE POLICY "Workspace members can view ICP profiles"
  ON icp_profiles FOR SELECT
  USING (is_workspace_member(workspace_id) OR is_org_admin() OR is_super_admin());

-- MARKET SIZING REPORTS
CREATE POLICY "Workspace members can view market sizing reports"
  ON market_sizing_reports FOR SELECT
  USING (is_workspace_member(workspace_id) OR is_org_admin() OR is_super_admin());

-- CAMPAIGN PLAYBOOKS
CREATE POLICY "Workspace members can view playbooks"
  ON campaign_playbooks FOR SELECT
  USING (is_workspace_member(workspace_id) OR is_org_admin() OR is_super_admin());

CREATE POLICY "Workspace members can approve playbooks"
  ON campaign_playbooks FOR UPDATE
  USING (is_workspace_member(workspace_id) OR is_org_admin());

-- CREDIT LEDGER (read-only for users — writes from agent-service via service role)
CREATE POLICY "Users can view credits for their org"
  ON credit_ledger FOR SELECT
  USING (org_id = auth_org_id() OR is_super_admin());

-- ============================================================
-- SUPABASE STORAGE BUCKETS
-- ============================================================

-- Run in Supabase dashboard or via API:
-- Create bucket: 'vault-documents'
-- Public: false
-- File size limit: 20MB
-- Allowed MIME types: application/pdf

-- Storage RLS: users can only upload to their workspace folder
-- Path convention: vault-documents/{workspace_id}/{document_id}/{filename}

-- ============================================================
-- REALTIME
-- ============================================================

-- Enable Realtime on tables that Mission Control subscribes to:
-- agent_runs            → agent status badges (client-filtered further by
--                          the selected project_id/campaign_id)
-- research_signals      → Research tab live updates
-- icp_profiles          → ICP tab live updates
-- market_sizing_reports → Market Sizing tab live updates
-- campaign_playbooks    → Architect tab live updates
-- vault_documents       → vault ingestion status
-- projects, campaigns   → navigation/selector updates

-- Run in Supabase dashboard: Database → Replication → enable for above tables.

-- ============================================================
-- UTILITY FUNCTIONS
-- ============================================================

-- Auto-update updated_at on any table that has the column
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER organisations_updated_at
  BEFORE UPDATE ON organisations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER workspace_integrations_updated_at
  BEFORE UPDATE ON workspace_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER vault_documents_updated_at
  BEFORE UPDATE ON vault_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER campaign_playbooks_updated_at
  BEFORE UPDATE ON campaign_playbooks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- CONSISTENCY TRIGGERS
-- Every table carries workspace_id directly (denormalized, for RLS).
-- These triggers guarantee that denormalized value can never drift
-- from the row's actual parent Project/Campaign.
-- ============================================================

CREATE OR REPLACE FUNCTION check_project_child_workspace_consistency()
RETURNS TRIGGER AS $$
DECLARE proj_ws UUID;
BEGIN
  SELECT workspace_id INTO proj_ws FROM projects WHERE id = NEW.project_id;
  IF proj_ws IS NULL THEN
    RAISE EXCEPTION 'project % not found', NEW.project_id;
  END IF;
  IF proj_ws != NEW.workspace_id THEN
    RAISE EXCEPTION '% workspace_id (%) does not match project workspace_id (%)',
      TG_TABLE_NAME, NEW.workspace_id, proj_ws;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE TRIGGER campaigns_check_workspace
  BEFORE INSERT OR UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION check_project_child_workspace_consistency();

CREATE TRIGGER research_signals_check_workspace
  BEFORE INSERT OR UPDATE ON research_signals
  FOR EACH ROW EXECUTE FUNCTION check_project_child_workspace_consistency();

CREATE TRIGGER icp_profiles_check_workspace
  BEFORE INSERT OR UPDATE ON icp_profiles
  FOR EACH ROW EXECUTE FUNCTION check_project_child_workspace_consistency();

CREATE TRIGGER market_sizing_reports_check_workspace
  BEFORE INSERT OR UPDATE ON market_sizing_reports
  FOR EACH ROW EXECUTE FUNCTION check_project_child_workspace_consistency();

-- CampaignPlaybook.project_id is derived from campaign_id, never written
-- directly by application code.
CREATE OR REPLACE FUNCTION set_campaign_playbook_project_id()
RETURNS TRIGGER AS $$
DECLARE camp_project UUID;
    camp_ws UUID;
BEGIN
  SELECT project_id, workspace_id INTO camp_project, camp_ws FROM campaigns WHERE id = NEW.campaign_id;
  IF camp_project IS NULL THEN
    RAISE EXCEPTION 'campaign % not found', NEW.campaign_id;
  END IF;
  NEW.project_id := camp_project;
  IF NEW.workspace_id != camp_ws THEN
    RAISE EXCEPTION 'campaign_playbooks workspace_id (%) does not match campaign workspace_id (%)', NEW.workspace_id, camp_ws;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE TRIGGER campaign_playbooks_set_project_id
  BEFORE INSERT OR UPDATE OF campaign_id ON campaign_playbooks
  FOR EACH ROW EXECUTE FUNCTION set_campaign_playbook_project_id();

-- ============================================================
-- SEED: SUPER ADMIN PROFILE SETUP NOTE
-- ============================================================
-- After first login, set super_admin role directly in Supabase:
-- UPDATE profiles SET role = 'super_admin' WHERE email = 'your@email.com';
-- No in-app flow for this — intentional.

-- ============================================================
-- CREDIT DEDUCTION FUNCTION
-- Called by agent-service after each successful agent run.
-- Uses service role — bypasses RLS intentionally.
-- ============================================================

CREATE OR REPLACE FUNCTION deduct_credits(
  p_org_id UUID,
  p_workspace_id UUID,
  p_profile_id UUID,
  p_agent_run_id UUID,
  p_action_type credit_action_type,
  p_credits INTEGER
)
RETURNS VOID AS $$
BEGIN
  -- Log to ledger
  INSERT INTO credit_ledger (
    org_id, workspace_id, profile_id, agent_run_id, action_type, credits_used
  ) VALUES (
    p_org_id, p_workspace_id, p_profile_id, p_agent_run_id, p_action_type, p_credits
  );

  -- Deduct from organisation pool
  UPDATE organisations
  SET credit_balance = credit_balance - p_credits
  WHERE id = p_org_id;

  -- Update agent_run credits_used
  UPDATE agent_runs
  SET credits_used = p_credits
  WHERE id = p_agent_run_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RAG RETRIEVAL FUNCTION
-- Called by agent-service for Brand Voice Vault context retrieval.
-- ============================================================

CREATE OR REPLACE FUNCTION retrieve_vault_context(
  p_workspace_id UUID,
  p_query_embedding vector(1536),
  p_top_k INTEGER DEFAULT 8
)
RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  content TEXT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    vc.id AS chunk_id,
    vc.document_id,
    vc.content,
    1 - (vc.embedding <=> p_query_embedding) AS similarity
  FROM vault_chunks vc
  JOIN vault_documents vd ON vd.id = vc.document_id
  WHERE vc.workspace_id = p_workspace_id
    AND vd.status = 'ready'
  ORDER BY vc.embedding <=> p_query_embedding
  LIMIT p_top_k;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
