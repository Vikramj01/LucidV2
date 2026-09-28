-- Sprint 10: store the Research Agent's open-ended research questions and the
-- answers it synthesised for them (PRD §4.4). Additive and safe to re-run.
-- Apply before deploying the Sprint 10 agent-service: its store_node writes
-- both columns and inserts will fail without them.

ALTER TABLE research_signals
  ADD COLUMN IF NOT EXISTS research_questions TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS research_findings  JSONB  NOT NULL DEFAULT '[]';

-- research_findings shape:
-- [{ "question": "string", "answer": "string", "sources": ["url"] }]
