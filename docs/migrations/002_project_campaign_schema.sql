-- ============================================================
-- Migration 002: Project/Campaign hierarchy + ICP/Market Sizing
-- agent outputs + Workspace external-storage integrations
-- ============================================================
-- Prerequisite: 001_enum_changes.sql has been applied and committed.
-- Apply via `psql "$DIRECT_URL" -f docs/migrations/002_project_campaign_schema.sql`
-- or the Supabase SQL editor. Safe to wrap in a single transaction —
-- unlike 001, nothing here adds an enum value that's used in the same
-- statement it's added in.
-- ============================================================

-- ============================================================
-- NEW ENUMS
-- ============================================================

CREATE TYPE project_status AS ENUM ('active', 'archived');
CREATE TYPE campaign_status AS ENUM ('active', 'completed', 'archived');
CREATE TYPE integration_provider AS ENUM ('google_drive', 'notion');
CREATE TYPE integration_status AS ENUM ('connected', 'disconnected', 'error');

-- ============================================================
-- PROJECTS
-- The reusable knowledge container. Research/ICP/Market Sizing are
-- scoped here so they're shared across every Campaign underneath.
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

-- ============================================================
-- CAMPAIGNS
-- An individual execution push under a Project, with its own goal
-- and channel selection. Architect Agent runs at this level.
-- ============================================================

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
-- RESEARCH SIGNALS (renamed from market_signals, +project_id)
-- ============================================================

ALTER TABLE market_signals RENAME TO research_signals;
ALTER INDEX market_signals_workspace_idx RENAME TO research_signals_workspace_idx;

ALTER TABLE research_signals ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
-- NOT NULL is set in 003_backfill.sql, after existing rows are backfilled.

CREATE INDEX research_signals_project_idx ON research_signals(project_id);

-- ============================================================
-- ICP PROFILES (NEW) — ICP Agent output
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
-- MARKET SIZING REPORTS (NEW) — Market Sizing Agent output
-- ============================================================

CREATE TABLE market_sizing_reports (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_run_id        UUID NOT NULL REFERENCES agent_runs(id),
  research_signal_id  UUID REFERENCES research_signals(id),
  tam_estimate        JSONB NOT NULL,   -- { value, currency, methodology, assumptions[] }
  sam_estimate        JSONB NOT NULL,
  som_estimate         JSONB NOT NULL,
  methodology_notes   TEXT NOT NULL,
  sources              TEXT[] NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX market_sizing_reports_workspace_idx ON market_sizing_reports(workspace_id);
CREATE INDEX market_sizing_reports_project_idx ON market_sizing_reports(project_id);

-- ============================================================
-- CAMPAIGN PLAYBOOKS — add Project/Campaign/ICP/MarketSizing FKs
-- ============================================================

ALTER TABLE campaign_playbooks RENAME COLUMN market_signal_id TO research_signal_id;
ALTER TABLE campaign_playbooks ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE campaign_playbooks ADD COLUMN campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE;
ALTER TABLE campaign_playbooks ADD COLUMN icp_profile_id UUID REFERENCES icp_profiles(id);
ALTER TABLE campaign_playbooks ADD COLUMN market_sizing_report_id UUID REFERENCES market_sizing_reports(id);
-- project_id / campaign_id NOT NULL set in 003_backfill.sql.

CREATE INDEX campaign_playbooks_project_idx ON campaign_playbooks(project_id);
CREATE INDEX campaign_playbooks_campaign_idx ON campaign_playbooks(campaign_id);

-- ============================================================
-- AGENT RUNS — add Project/Campaign scoping
-- ============================================================

ALTER TABLE agent_runs ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE agent_runs ADD COLUMN campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE;

-- research/icp/market_sizing runs are project-scoped only; architect runs
-- are project+campaign-scoped; vault_ingest/builder/analyst are neither.
ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_scope_check CHECK (
  (agent_type IN ('research', 'icp', 'market_sizing') AND project_id IS NOT NULL AND campaign_id IS NULL)
  OR (agent_type = 'architect' AND project_id IS NOT NULL AND campaign_id IS NOT NULL)
  OR (agent_type IN ('vault_ingest', 'builder', 'analyst') AND project_id IS NULL AND campaign_id IS NULL)
);

CREATE INDEX agent_runs_project_idx ON agent_runs(project_id);
CREATE INDEX agent_runs_campaign_idx ON agent_runs(campaign_id);

-- ============================================================
-- VAULT DOCUMENTS — add external-storage source fields
-- ============================================================

ALTER TABLE vault_documents ADD COLUMN integration_id UUID;  -- FK added below, after workspace_integrations exists
ALTER TABLE vault_documents ADD COLUMN external_file_id TEXT;
ALTER TABLE vault_documents ADD COLUMN external_file_url TEXT;

-- ============================================================
-- WORKSPACE INTEGRATIONS (NEW) — Google Drive / Notion OAuth
-- connections. Token columns must NEVER be selectable by the
-- `authenticated` role — see RLS section below.
-- ============================================================

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

ALTER TABLE vault_documents
  ADD CONSTRAINT vault_documents_integration_fk
  FOREIGN KEY (integration_id) REFERENCES workspace_integrations(id);

-- Safe view for the frontend: connection status only, never token material.
-- security_invoker is required so this runs as the querying role and the
-- RLS policy on the base table (below) actually applies to it — without
-- it, the view would execute with its owner's privileges and could bypass
-- RLS entirely, leaking every workspace's integration status to every
-- authenticated user. Note that RLS policies can only attach to tables,
-- not views — CREATE POLICY on this view would fail; the view inherits
-- its access control from the base table's policy via security_invoker.
CREATE VIEW workspace_integrations_public
  WITH (security_invoker = true) AS
  SELECT id, workspace_id, provider, status, external_account_label,
         connected_at, last_synced_at, error_message
  FROM workspace_integrations;

-- ============================================================
-- CONSISTENCY TRIGGERS
-- The "every table carries workspace_id directly" convention is only
-- safe if the denormalized value can't drift from its parent's actual
-- workspace. Enforce it in the database, not just app-code discipline.
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER campaigns_check_workspace
  BEFORE INSERT OR UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION check_project_child_workspace_consistency();

CREATE TRIGGER research_signals_check_workspace
  BEFORE INSERT OR UPDATE OF project_id, workspace_id ON research_signals
  FOR EACH ROW WHEN (NEW.project_id IS NOT NULL)
  EXECUTE FUNCTION check_project_child_workspace_consistency();

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
$$ LANGUAGE plpgsql;

CREATE TRIGGER campaign_playbooks_set_project_id
  BEFORE INSERT OR UPDATE OF campaign_id ON campaign_playbooks
  FOR EACH ROW WHEN (NEW.campaign_id IS NOT NULL)
  EXECUTE FUNCTION set_campaign_playbook_project_id();

-- Reuse the existing updated_at trigger function for new tables that have the column.
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER workspace_integrations_updated_at
  BEFORE UPDATE ON workspace_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE icp_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_sizing_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_integrations ENABLE ROW LEVEL SECURITY;
-- research_signals already has RLS enabled (inherited from market_signals).

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

-- ICP PROFILES
CREATE POLICY "Workspace members can view ICP profiles"
  ON icp_profiles FOR SELECT
  USING (is_workspace_member(workspace_id) OR is_org_admin() OR is_super_admin());

-- MARKET SIZING REPORTS
CREATE POLICY "Workspace members can view market sizing reports"
  ON market_sizing_reports FOR SELECT
  USING (is_workspace_member(workspace_id) OR is_org_admin() OR is_super_admin());

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

-- ============================================================
-- REALTIME
-- ============================================================
-- In addition to the tables already registered (agent_runs,
-- campaign_playbooks, vault_documents), register:
--   projects, campaigns, research_signals (re-add under its new name),
--   icp_profiles, market_sizing_reports
-- Run in Supabase dashboard: Database -> Replication -> enable for the
-- above, or:
--   ALTER PUBLICATION supabase_realtime ADD TABLE projects;
--   ALTER PUBLICATION supabase_realtime ADD TABLE campaigns;
--   ALTER PUBLICATION supabase_realtime ADD TABLE research_signals;
--   ALTER PUBLICATION supabase_realtime ADD TABLE icp_profiles;
--   ALTER PUBLICATION supabase_realtime ADD TABLE market_sizing_reports;
