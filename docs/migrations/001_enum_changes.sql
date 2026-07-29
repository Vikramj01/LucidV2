-- ============================================================
-- Migration 001: Enum changes for Project/Campaign + 4-agent roster
-- ============================================================
-- IMPORTANT: Apply this file FIRST, alone, and let it commit before
-- running 002_project_campaign_schema.sql. Postgres will not allow a
-- newly-added enum value to be referenced (e.g. compared in a CHECK
-- constraint) within the same transaction that added it.
--
-- Apply via `psql "$DIRECT_URL" -f docs/migrations/001_enum_changes.sql`
-- or paste into the Supabase SQL editor and run it by itself.
-- Do NOT apply enum renames via `prisma db push` — its diff engine may
-- try to drop/recreate the type, which fails or cascades destructively
-- against columns and policies that depend on it.
-- ============================================================

-- agent_type: intel -> research (Research Agent's broadened scope),
-- plus the two new agents.
ALTER TYPE agent_type RENAME VALUE 'intel' TO 'research';
ALTER TYPE agent_type ADD VALUE IF NOT EXISTS 'icp';
ALTER TYPE agent_type ADD VALUE IF NOT EXISTS 'market_sizing';

-- credit_action_type: mirror the agent_type rename/additions.
ALTER TYPE credit_action_type RENAME VALUE 'intel_run' TO 'research_run';
ALTER TYPE credit_action_type ADD VALUE IF NOT EXISTS 'icp_run';
ALTER TYPE credit_action_type ADD VALUE IF NOT EXISTS 'market_sizing_run';

-- vault_source_type: 'url' was always assumed by application code
-- (shared/types/index.ts, the /vault/url route) but was never actually
-- added to this enum — fixing that pre-existing gap here, plus the two
-- new external-storage source types.
ALTER TYPE vault_source_type ADD VALUE IF NOT EXISTS 'url';
ALTER TYPE vault_source_type ADD VALUE IF NOT EXISTS 'google_drive';
ALTER TYPE vault_source_type ADD VALUE IF NOT EXISTS 'notion';
