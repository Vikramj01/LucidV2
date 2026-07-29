-- ============================================================
-- Migration 003: Backfill existing data into the new Project/Campaign
-- hierarchy, then tighten the new FKs to NOT NULL.
-- ============================================================
-- Prerequisite: 002_project_campaign_schema.sql has been applied.
-- Dry-run this against a Supabase branch / staging copy before running
-- against production — it writes new rows and mutates existing ones.
--
-- For every workspace with existing research_signals or
-- campaign_playbooks rows, this creates one "General" Project, backfills
-- research_signals.project_id to point at it, and creates one "Migrated
-- Campaign" per existing playbook (copying that playbook's own
-- campaign_goal/channels, so no information is collapsed or lost) so
-- each playbook gets a valid campaign_id.
-- ============================================================

DO $$
DECLARE
  ws RECORD;
  new_project_id UUID;
  owner_id UUID;
  pb RECORD;
  new_campaign_id UUID;
BEGIN
  FOR ws IN
    SELECT id AS workspace_id FROM workspaces w
    WHERE EXISTS (SELECT 1 FROM research_signals rs WHERE rs.workspace_id = w.id AND rs.project_id IS NULL)
       OR EXISTS (SELECT 1 FROM campaign_playbooks cp WHERE cp.workspace_id = w.id AND cp.campaign_id IS NULL)
  LOOP
    SELECT profile_id INTO owner_id FROM workspace_members
      WHERE workspace_id = ws.workspace_id ORDER BY created_at LIMIT 1;

    IF owner_id IS NULL THEN
      RAISE NOTICE 'workspace % has no members — skipping backfill (its research_signals/campaign_playbooks will still violate the NOT NULL constraints below; resolve manually)', ws.workspace_id;
      CONTINUE;
    END IF;

    INSERT INTO projects (workspace_id, name, description, status, created_by)
    VALUES (ws.workspace_id, 'General', 'Auto-created during Project/Campaign migration', 'active', owner_id)
    RETURNING id INTO new_project_id;

    UPDATE research_signals
    SET project_id = new_project_id
    WHERE workspace_id = ws.workspace_id AND project_id IS NULL;

    FOR pb IN
      SELECT id, campaign_goal, channels FROM campaign_playbooks
      WHERE workspace_id = ws.workspace_id AND campaign_id IS NULL
    LOOP
      INSERT INTO campaigns (workspace_id, project_id, name, campaign_goal, channels, status, created_by)
      VALUES (ws.workspace_id, new_project_id, 'Migrated Campaign', pb.campaign_goal, pb.channels, 'active', owner_id)
      RETURNING id INTO new_campaign_id;

      -- project_id is auto-derived by the campaign_playbooks_set_project_id
      -- trigger from campaign_id — do not set it directly here.
      UPDATE campaign_playbooks
      SET campaign_id = new_campaign_id
      WHERE id = pb.id;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================
-- VERIFY before tightening constraints — both must return 0 rows.
-- If either does not, resolve those rows manually (most likely cause:
-- a workspace with zero workspace_members, per the RAISE NOTICE above)
-- before proceeding.
-- ============================================================
-- SELECT * FROM research_signals WHERE project_id IS NULL;
-- SELECT * FROM campaign_playbooks WHERE project_id IS NULL OR campaign_id IS NULL;

ALTER TABLE research_signals ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE campaign_playbooks ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE campaign_playbooks ALTER COLUMN campaign_id SET NOT NULL;
