-- ============================================================
-- Lucid v2 — Supabase Database Schema
-- MVP1: Intel Agent + Architect Agent + Brand Voice Vault
-- ============================================================
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
CREATE TYPE agent_type AS ENUM ('intel', 'architect', 'builder', 'analyst', 'vault_ingest');
CREATE TYPE vault_doc_status AS ENUM ('queued', 'processing', 'ready', 'failed');
CREATE TYPE vault_source_type AS ENUM ('pdf', 'url', 'free_text');
CREATE TYPE campaign_goal AS ENUM ('awareness', 'leads', 'pipeline', 'retention');
CREATE TYPE campaign_channel AS ENUM ('linkedin', 'google_search', 'google_display', 'meta', 'email');
CREATE TYPE playbook_status AS ENUM ('draft', 'approved', 'archived');
CREATE TYPE credit_action_type AS ENUM ('intel_run', 'architect_run', 'vault_ingest');

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
-- One per client brand. All agent data lives here.
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
-- BRAND VOICE VAULT
-- ============================================================

-- VAULT DOCUMENTS
-- Metadata record for each ingested document.
CREATE TABLE vault_documents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  source_type     vault_source_type NOT NULL,
  file_path       TEXT,                               -- Supabase Storage path (PDF)
  file_size_bytes INTEGER,
  status          vault_doc_status NOT NULL DEFAULT 'queued',
  error_message   TEXT,
  chunk_count     INTEGER,                            -- populated after ingestion
  created_by      UUID NOT NULL REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
-- ============================================================

CREATE TABLE agent_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
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

-- ============================================================
-- INTEL AGENT OUTPUTS
-- ============================================================

CREATE TABLE market_signals (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_run_id          UUID NOT NULL REFERENCES agent_runs(id),
  competitors_analysed  TEXT[] NOT NULL DEFAULT '{}',
  competitor_profiles   JSONB NOT NULL DEFAULT '[]',  -- array of competitor profile objects
  market_gaps           TEXT[] NOT NULL DEFAULT '{}',
  intent_triggers       TEXT[] NOT NULL DEFAULT '{}',
  recommended_angles    TEXT[] NOT NULL DEFAULT '{}',
  sources               TEXT[] NOT NULL DEFAULT '{}', -- cited URLs
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Full market_signals JSONB structure for competitor_profiles:
-- [
--   {
--     "url": "string",
--     "key_messaging": ["string"],
--     "target_audience": "string",
--     "content_themes": ["string"],
--     "primary_cta": "string"
--   }
-- ]

CREATE INDEX market_signals_workspace_idx ON market_signals(workspace_id);

-- ============================================================
-- ARCHITECT AGENT OUTPUTS
-- ============================================================

CREATE TABLE campaign_playbooks (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_run_id      UUID NOT NULL REFERENCES agent_runs(id),
  market_signal_id  UUID REFERENCES market_signals(id),
  campaign_goal     campaign_goal NOT NULL,
  channels          campaign_channel[] NOT NULL DEFAULT '{}',
  winning_angle     TEXT NOT NULL,
  target_persona    TEXT NOT NULL,
  playbook_content  JSONB NOT NULL DEFAULT '{}',      -- full playbook per channel (see below)
  status            playbook_status NOT NULL DEFAULT 'draft',
  approved_by       UUID REFERENCES profiles(id),
  approved_at       TIMESTAMPTZ,
  version           INTEGER NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Full playbook_content JSONB structure:
-- {
--   "channels": {
--     "linkedin": {
--       "strategy_rationale": "string (with source citations)",
--       "campaign_phases": [{ "phase": "string", "budget_pct": number, "duration_days": number }],
--       "messaging_framework": {
--         "hero_message": "string",
--         "supporting_points": ["string"],
--         "proof_points": ["string"]
--       },
--       "ad_copy_variants": [{ "format": "string", "headline": "string", "body": "string", "cta": "string" }],
--       "success_metrics": [{ "kpi": "string", "target": "string" }]
--     },
--     "google_search": { ... },
--     "meta": { ... }
--   },
--   "sources": ["string"]
-- }

CREATE INDEX campaign_playbooks_workspace_idx ON campaign_playbooks(workspace_id);
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
ALTER TABLE vault_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_signals ENABLE ROW LEVEL SECURITY;
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

-- MARKET SIGNALS
CREATE POLICY "Workspace members can view market signals"
  ON market_signals FOR SELECT
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
-- agent_runs        → agent status badges
-- market_signals    → Intel tab live updates
-- campaign_playbooks → Architect tab live updates
-- vault_documents   → vault ingestion status

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
