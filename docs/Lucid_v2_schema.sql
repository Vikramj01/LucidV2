-- ============================================================
-- Lucid v2 — Supabase Database Schema
-- MVP1 v2.0: Research Agent + ICP Agent + Market Sizing Agent +
--            Architect Agent + Brand Voice Vault (incl. Drive/Notion)
--            + Project/Campaign hierarchy
-- ============================================================
-- This file describes the schema as it actually exists on the
-- `lucid-v2-dev` Supabase project (project_id sxggwrcugwcsirewyzcb),
-- after migrations v1_0_baseline_schema through
-- 009_restrict_workspace_integrations_token_columns. It is kept as
-- documentation / a from-scratch bootstrap script — the live project
-- was built up via incremental `apply_migration` calls, not by
-- running this file directly. If you provision a new environment,
-- running this file top to bottom reproduces the same end state.
-- ============================================================

-- EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
-- KNOWN FOLLOW-UP: Supabase's security advisor flags `vector` as installed
-- in the `public` schema (extension_in_public). Moving it requires
-- recreating every `vector`-typed column/function signature, so it's
-- deferred to a dedicated migration rather than folded in here.

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE org_type AS ENUM ('agency', 'brand');
CREATE TYPE user_role AS ENUM ('org_admin', 'workspace_member', 'super_admin');
CREATE TYPE user_status AS ENUM ('active', 'suspended', 'invited');
CREATE TYPE agent_mode AS ENUM ('approval_gated', 'autonomous');
CREATE TYPE ui_theme AS ENUM ('dark', 'light');
CREATE TYPE agent_run_status AS ENUM ('queued', 'running', 'complete', 'failed');
-- v2.0: 'intel' renamed to 'research'; 'icp' and 'market_sizing' added.
CREATE TYPE agent_type AS ENUM ('research', 'architect', 'builder', 'analyst', 'vault_ingest', 'icp', 'market_sizing');
CREATE TYPE vault_doc_status AS ENUM ('queued', 'processing', 'ready', 'failed');
-- v2.0: 'url', 'google_drive', 'notion' added.
CREATE TYPE vault_source_type AS ENUM ('pdf', 'free_text', 'url', 'google_drive', 'notion');
CREATE TYPE campaign_goal AS ENUM ('awareness', 'leads', 'pipeline', 'retention');
CREATE TYPE campaign_channel AS ENUM ('linkedin', 'google_search', 'google_display', 'meta', 'email');
CREATE TYPE playbook_status AS ENUM ('draft', 'approved', 'archived');
-- v2.0: 'intel_run' renamed to 'research_run'; 'icp_run' and 'market_sizing_run' added.
CREATE TYPE credit_action_type AS ENUM ('research_run', 'architect_run', 'vault_ingest', 'icp_run', 'market_sizing_run');
-- v2.0 (NEW)
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
-- One per client brand. All Projects, Campaigns, and the Brand Voice Vault live here.
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
-- PROJECTS & CAMPAIGNS (v2.0 — NEW)
-- Project = reusable knowledge container (Research/ICP/Market Sizing
-- live here, shared across every Campaign underneath it).
-- Campaign = an individual execution push (Architect Agent runs here).
-- Both soft-delete via status = 'archived', never hard DELETE.
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
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,  -- denormalized, must match project's workspace_id (enforced by trigger below)
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
-- Workspace-scoped — shared across every Project/Campaign in the workspace.
-- ============================================================

-- WORKSPACE INTEGRATIONS (v2.0 — NEW)
-- Google Drive / Notion OAuth connections, one per workspace per provider.
-- SECURITY: access_token_encrypted / refresh_token_encrypted / token_expires_at
-- are NOT selectable by the `authenticated` role at all (see column-level
-- GRANT below) — only service_role (backend/agent-service) can read them.
-- The frontend reads connection status through the safe columns only.
CREATE TABLE workspace_integrations (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id            UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider                integration_provider NOT NULL,
  status                  integration_status NOT NULL DEFAULT 'connected',
  access_token_encrypted  TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  token_expires_at        TIMESTAMPTZ,
  external_account_id     TEXT,
  external_account_label  TEXT,
  scopes                  TEXT[] NOT NULL DEFAULT '{}',
  connected_by            UUID NOT NULL REFERENCES profiles(id),
  connected_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at          TIMESTAMPTZ,
  error_message           TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX workspace_integrations_workspace_idx ON workspace_integrations(workspace_id);

-- VAULT DOCUMENTS
-- Metadata record for each ingested document.
CREATE TABLE vault_documents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  source_type       vault_source_type NOT NULL,
  file_path         TEXT,                               -- Supabase Storage path (PDF)
  file_size_bytes   INTEGER,
  status            vault_doc_status NOT NULL DEFAULT 'queued',
  error_message     TEXT,
  chunk_count       INTEGER,                            -- populated after ingestion
  created_by        UUID NOT NULL REFERENCES profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- v2.0 (NEW): set when source_type is 'google_drive' or 'notion'
  integration_id    UUID REFERENCES workspace_integrations(id),
  external_file_id  TEXT,
  external_file_url TEXT
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
-- project_id/campaign_id are nullable: vault_ingest runs are workspace-level,
-- research/icp/market_sizing runs are project-level, architect runs are
-- campaign-level. Denormalized workspace_id is checked against whichever of
-- project_id/campaign_id is set by the trigger below.
-- ============================================================

CREATE TABLE agent_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES projects(id),
  campaign_id     UUID REFERENCES campaigns(id),
  agent_type      agent_type NOT NULL,
  status          agent_run_status NOT NULL DEFAULT 'queued',
  job_id          TEXT,                               -- Redis job ID
  input_payload   JSONB NOT NULL DEFAULT '{}',        -- what was passed to the agent
  error_message   TEXT,
  credits_used    INTEGER NOT NULL DEFAULT 0,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  triggered_by    UUID NOT NULL REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX agent_runs_workspace_idx ON agent_runs(workspace_id);
CREATE INDEX agent_runs_status_idx ON agent_runs(workspace_id, agent_type, status);
CREATE INDEX agent_runs_project_idx ON agent_runs(project_id);
CREATE INDEX agent_runs_campaign_idx ON agent_runs(campaign_id);

-- ============================================================
-- RESEARCH AGENT OUTPUTS
-- (renamed + broadened from v1.0's Intel Agent / market_signals — table
-- keeps its old FK constraint names since it was renamed in place, not
-- dropped and recreated: market_signals_workspace_id_fkey etc.)
-- Scoped to project_id — reused across every Campaign in the Project.
-- ============================================================

CREATE TABLE research_signals (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_run_id          UUID NOT NULL UNIQUE REFERENCES agent_runs(id),
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
-- ICP AGENT OUTPUTS (v2.0 — NEW)
-- Scoped to project_id. research_signal_id is nullable at the column level
-- but the agent hard-depends on a Research Signal existing for the Project
-- before it can run (enforced in application logic, not the DB).
-- ============================================================

CREATE TABLE icp_profiles (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_run_id        UUID NOT NULL UNIQUE REFERENCES agent_runs(id),
  research_signal_id  UUID REFERENCES research_signals(id),
  firmographics       JSONB NOT NULL DEFAULT '{}',
  personas            JSONB NOT NULL DEFAULT '[]',
  pain_points         TEXT[] NOT NULL DEFAULT '{}',
  buying_triggers     TEXT[] NOT NULL DEFAULT '{}',
  sources             TEXT[] NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX icp_profiles_workspace_idx ON icp_profiles(workspace_id);
CREATE INDEX icp_profiles_project_idx ON icp_profiles(project_id);

-- ============================================================
-- MARKET SIZING AGENT OUTPUTS (v2.0 — NEW)
-- Scoped to project_id. TAM/SAM/SOM estimates each carry an explicit
-- methodology + assumptions — every number must be justified, not asserted.
-- ============================================================

CREATE TABLE market_sizing_reports (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_run_id        UUID NOT NULL UNIQUE REFERENCES agent_runs(id),
  research_signal_id  UUID REFERENCES research_signals(id),
  tam_estimate        JSONB NOT NULL,  -- { value, currency, methodology, assumptions[] }
  sam_estimate        JSONB NOT NULL,
  som_estimate         JSONB NOT NULL,
  methodology_notes   TEXT NOT NULL,
  sources             TEXT[] NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX market_sizing_reports_workspace_idx ON market_sizing_reports(workspace_id);
CREATE INDEX market_sizing_reports_project_idx ON market_sizing_reports(project_id);

-- ============================================================
-- ARCHITECT AGENT OUTPUTS
-- Scoped to campaign_id. project_id is auto-derived from the Campaign by
-- trigger, not supplied directly (see set_campaign_playbook_project_id).
-- icp_profile_id / market_sizing_report_id are nullable — Architect degrades
-- gracefully when either is missing (flags the gap in playbook_content.risk_flags
-- rather than blocking).
-- ============================================================

CREATE TABLE campaign_playbooks (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id            UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id              UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  campaign_id             UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  agent_run_id            UUID NOT NULL UNIQUE REFERENCES agent_runs(id),
  research_signal_id      UUID REFERENCES research_signals(id),
  icp_profile_id          UUID REFERENCES icp_profiles(id),
  market_sizing_report_id UUID REFERENCES market_sizing_reports(id),
  campaign_goal           campaign_goal NOT NULL,
  channels                campaign_channel[] NOT NULL DEFAULT '{}',
  winning_angle           TEXT NOT NULL,
  target_persona          TEXT NOT NULL,
  playbook_content        JSONB NOT NULL DEFAULT '{}',      -- see shared/types/index.ts PlaybookContent for the actual shape
  status                  playbook_status NOT NULL DEFAULT 'draft',
  approved_by             UUID REFERENCES profiles(id),
  approved_at             TIMESTAMPTZ,
  version                 INTEGER NOT NULL DEFAULT 1,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX campaign_playbooks_workspace_idx ON campaign_playbooks(workspace_id);
CREATE INDEX campaign_playbooks_campaign_idx ON campaign_playbooks(campaign_id);
CREATE INDEX campaign_playbooks_status_idx ON campaign_playbooks(workspace_id, status);

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
-- RLS HELPER FUNCTIONS
-- SECURITY DEFINER with `SET search_path = ''` and fully public.-qualified
-- table references throughout (a mutable/default search_path on a
-- SECURITY DEFINER function lets a caller who can create objects earlier
-- in their session's search_path shadow the tables these functions query).
-- ============================================================

CREATE OR REPLACE FUNCTION auth_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_org_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role IN ('org_admin', 'super_admin')
  FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role = 'super_admin'
  FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_workspace_member(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id AND profile_id = auth.uid()
  )
$$;

-- ============================================================
-- RLS POLICIES
-- ============================================================

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

-- PROJECTS (soft-delete via UPDATE status='archived' — no DELETE policy)
CREATE POLICY "Workspace members can view projects"
  ON projects FOR SELECT
  USING (is_workspace_member(workspace_id) OR is_org_admin() OR is_super_admin());

CREATE POLICY "Workspace members can create projects"
  ON projects FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id) OR is_org_admin());

CREATE POLICY "Workspace members can update projects"
  ON projects FOR UPDATE
  USING (is_workspace_member(workspace_id) OR is_org_admin());

-- CAMPAIGNS (soft-delete via UPDATE status='archived' — no DELETE policy)
CREATE POLICY "Workspace members can view campaigns"
  ON campaigns FOR SELECT
  USING (is_workspace_member(workspace_id) OR is_org_admin() OR is_super_admin());

CREATE POLICY "Workspace members can create campaigns"
  ON campaigns FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id) OR is_org_admin());

CREATE POLICY "Workspace members can update campaigns"
  ON campaigns FOR UPDATE
  USING (is_workspace_member(workspace_id) OR is_org_admin());

-- WORKSPACE INTEGRATIONS (status only — see column GRANT below for token protection)
CREATE POLICY "Workspace members can view integration status"
  ON workspace_integrations FOR SELECT
  USING (is_workspace_member(workspace_id) OR is_org_admin() OR is_super_admin());

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
CREATE POLICY "Workspace members can view market signals"
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
-- WORKSPACE_ID DENORMALIZATION INTEGRITY — TRIGGERS
-- Every table above carries workspace_id even where it also carries
-- project_id/campaign_id, deliberately, so RLS can enforce workspace
-- isolation directly on every table. These triggers guarantee that
-- denormalized workspace_id never drifts from the parent Project's or
-- Campaign's actual workspace — enforced in the database, not just
-- trusted from application code.
-- ============================================================

CREATE OR REPLACE FUNCTION check_project_child_workspace_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
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
$$;

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

-- campaign_playbooks: project_id is auto-derived from the Campaign (not
-- supplied by the caller), and workspace_id is checked against the Campaign.
CREATE OR REPLACE FUNCTION set_campaign_playbook_project_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
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
$$;

CREATE TRIGGER campaign_playbooks_set_project_id
  BEFORE INSERT OR UPDATE ON campaign_playbooks
  FOR EACH ROW EXECUTE FUNCTION set_campaign_playbook_project_id();

-- agent_runs: project_id/campaign_id are both nullable (vault_ingest runs
-- have neither) — only the FK that's actually set gets checked.
CREATE OR REPLACE FUNCTION check_agent_run_workspace_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE proj_ws UUID;
    camp_ws UUID;
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    SELECT workspace_id INTO proj_ws FROM public.projects WHERE id = NEW.project_id;
    IF proj_ws IS NULL THEN
      RAISE EXCEPTION 'project % not found', NEW.project_id;
    END IF;
    IF proj_ws != NEW.workspace_id THEN
      RAISE EXCEPTION 'agent_runs workspace_id (%) does not match project workspace_id (%)', NEW.workspace_id, proj_ws;
    END IF;
  END IF;

  IF NEW.campaign_id IS NOT NULL THEN
    SELECT workspace_id INTO camp_ws FROM public.campaigns WHERE id = NEW.campaign_id;
    IF camp_ws IS NULL THEN
      RAISE EXCEPTION 'campaign % not found', NEW.campaign_id;
    END IF;
    IF camp_ws != NEW.workspace_id THEN
      RAISE EXCEPTION 'agent_runs workspace_id (%) does not match campaign workspace_id (%)', NEW.workspace_id, camp_ws;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER agent_runs_check_workspace
  BEFORE INSERT OR UPDATE ON agent_runs
  FOR EACH ROW EXECUTE FUNCTION check_agent_run_workspace_consistency();

-- ============================================================
-- WORKSPACE_INTEGRATIONS TOKEN PROTECTION
-- The RLS SELECT policy above is row-level only — it does not stop a
-- workspace member's own JWT from selecting access_token_encrypted /
-- refresh_token_encrypted / token_expires_at directly via PostgREST.
-- Column-level GRANT closes that: authenticated keeps row access (needed
-- for the safe columns, and the RLS policy stays in place for any future
-- security_invoker view) but has no SELECT grant at all on the token
-- columns. service_role (backend/agent-service) is unaffected.
-- ============================================================

REVOKE SELECT ON workspace_integrations FROM authenticated;

GRANT SELECT (
  id,
  workspace_id,
  provider,
  status,
  external_account_id,
  external_account_label,
  scopes,
  connected_by,
  connected_at,
  last_synced_at,
  error_message,
  created_at,
  updated_at
) ON workspace_integrations TO authenticated;

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
-- agent_runs             → agent status badges across all tabs (client-filtered by selected project_id/campaign_id)
-- research_signals       → Research tab live updates
-- icp_profiles           → ICP tab live updates
-- market_sizing_reports  → Market Sizing tab live updates
-- campaign_playbooks     → Architect tab live updates
-- vault_documents        → vault ingestion status

-- Run in Supabase dashboard: Database → Replication → enable for above tables.

-- ============================================================
-- UTILITY FUNCTIONS
-- ============================================================

-- Auto-update updated_at on any table that has the column
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

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
-- SEED: SUPER ADMIN PROFILE SETUP NOTE
-- ============================================================
-- After first login, set super_admin role directly in Supabase:
-- UPDATE profiles SET role = 'super_admin' WHERE email = 'your@email.com';
-- No in-app flow for this — intentional.

-- ============================================================
-- CREDIT DEDUCTION FUNCTION
-- Called by agent-service after each successful agent run.
-- Uses service role — bypasses RLS intentionally.
-- SECURITY: this function performs no ownership/membership check on its
-- arguments, so EXECUTE is revoked from anon/authenticated below — it must
-- only ever be invoked by backend/agent-service via service_role. Left
-- open to PUBLIC, any signed-in (or anonymous) caller could pass an
-- arbitrary org_id/workspace_id/agent_run_id and manipulate any
-- organisation's credit balance.
-- ============================================================

CREATE OR REPLACE FUNCTION deduct_credits(
  p_org_id UUID,
  p_workspace_id UUID,
  p_profile_id UUID,
  p_agent_run_id UUID,
  p_action_type credit_action_type,
  p_credits INTEGER
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Log to ledger
  INSERT INTO public.credit_ledger (
    org_id, workspace_id, profile_id, agent_run_id, action_type, credits_used
  ) VALUES (
    p_org_id, p_workspace_id, p_profile_id, p_agent_run_id, p_action_type, p_credits
  );

  -- Deduct from organisation pool
  UPDATE public.organisations
  SET credit_balance = credit_balance - p_credits
  WHERE id = p_org_id;

  -- Update agent_run credits_used
  UPDATE public.agent_runs
  SET credits_used = p_credits
  WHERE id = p_agent_run_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION deduct_credits(UUID, UUID, UUID, UUID, credit_action_type, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION deduct_credits(UUID, UUID, UUID, UUID, credit_action_type, INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION deduct_credits(UUID, UUID, UUID, UUID, credit_action_type, INTEGER) FROM authenticated;

-- ============================================================
-- RAG RETRIEVAL FUNCTION
-- Called by agent-service for Brand Voice Vault context retrieval
-- (Architect Agent and ICP Agent both use this).
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
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vc.id AS chunk_id,
    vc.document_id,
    vc.content,
    1 - (vc.embedding <=> p_query_embedding) AS similarity
  FROM public.vault_chunks vc
  JOIN public.vault_documents vd ON vd.id = vc.document_id
  WHERE vc.workspace_id = p_workspace_id
    AND vd.status = 'ready'
  ORDER BY vc.embedding <=> p_query_embedding
  LIMIT p_top_k;
END;
$$;
