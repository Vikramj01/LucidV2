# Lucid v2 — MVP1 v2.0 Sprint Plan
**Scope:** Bring the codebase from v1.0 (Intel + Architect, flat under Workspace) to the v2.0 PRD (`docs/Lucid_v2_PRD_MVP1.md`): Research, ICP, Market Sizing, and Architect agents over the Project → Campaign hierarchy, plus Google Drive/Notion vault ingestion.
**Start date:** 2026-09-28
**Duration:** 7 one-week sprints (Sprints 10–16, 35 working days)
**Definition of done:** All eight success criteria in PRD §11 pass end-to-end on production. The key test is criterion 7: a second Campaign under the same Project reuses its Research/ICP/Market Sizing without re-running them.

---

## Starting Point (as of Sprint 9)

| Layer | State |
|---|---|
| Database (`docs/Lucid_v2_schema.sql`, Prisma) | ✅ v2.0: projects, campaigns, research_signals, icp_profiles, market_sizing_reports, workspace_integrations, workspace-consistency triggers |
| Backend | 🟡 Partly v2.0: Projects/Campaigns CRUD, `research/run`, `architect/run`, research-signals, playbooks, approve, export. **Missing:** ICP/Market Sizing triggers and outputs, `research_questions` input, integrations/OAuth, `vault/drive`, `vault/notion`, internal token endpoint, audit log |
| Agent-service | 🔴 v1.0: dispatches `intel_run` / `architect_run` / `vault_ingest` only. **The backend sends `research_run`, so Research jobs are dropped as "Unknown job_type".** Writes to the old `market_signals` table. No ICP or Market Sizing graphs, and Architect has no `validate_node` |
| Frontend | 🔴 v1.0: `lib/api.ts` calls endpoints deleted in Sprint 9 (`/agents/intel/run`, `/market-signals`, `/workspaces/:id/playbooks`). No Project/Campaign selectors; tabs are Overview/Vault/Intel/Architect |
| Docs | 🟡 `CLAUDE.md` still describes the two-agent v1.0 scope |

---

## Sprint Overview

| Sprint | Theme | Dates |
|---|---|---|
| 10 | Research Agent port + unbreak the pipeline | Sep 28 – Oct 2 |
| 11 | ICP Agent + Market Sizing Agent | Oct 5 – 9 |
| 12 | Architect Agent v2 + credits & audit log | Oct 12 – 16 |
| 13 | Mission Control v2 (Project/Campaign navigation + new tabs) | Oct 19 – 23 |
| 14 | Google Drive + Notion integrations | Oct 26 – 30 |
| 15 | Vimi Chat v2 flow + admin credits | Nov 2 – 6 |
| 16 | Migration, hardening, deploy, MVP1 sign-off | Nov 9 – 13 |

---

## Sprint 10 — Research Agent Port + Unbreak the Pipeline (Sep 28 – Oct 2)

**Goal:** A Research job triggered through the v2.0 API runs and writes a `research_signals` row scoped to its Project. The frontend compiles against the v2.0 API again.

### Monday Sep 28
- [ ] Agent-service: rename `nodes/intel/` → `nodes/research/` and `graphs/intel_agent.py` → `graphs/research_agent.py`
- [ ] Agent-service: `worker.dispatch()` handles `research_run`; delete the `intel_run` branch
- [ ] Agent-service: add Pydantic job payload models in `app/models/jobs.py` for all five v2.0 job types; reject malformed payloads by marking the run failed
- [ ] Update `CLAUDE.md` to the v2.0 scope: four agents, Project/Campaign hierarchy, new table names

### Tuesday Sep 29
- [ ] Research `scrape_node`: parallel Firecrawl scrape per URL (`asyncio.gather`); keep partial-failure handling
- [ ] Research `extract_node`: per-competitor extraction that also takes the optional `research_questions`
- [ ] Backend: `research/run` accepts `research_questions` (optional string array) and forwards it in the job payload and `input_payload`

### Wednesday Sep 30
- [ ] Research `synthesise_node` (new): Claude compares competitors against each other → `market_gaps`, `intent_triggers`, `recommended_angles`
- [ ] Research `write_node` (new): assemble the Research Signal JSON exactly as specified in PRD §4.4
- [ ] Research `store_node`: write to `research_signals` with `workspace_id` and `project_id`; write `agent_runs` status and a `credit_ledger` row with `action_type = research_run`

### Thursday Oct 1
- [ ] Frontend `lib/api.ts`: replace the v1.0 agent/output calls with v2.0 ones: `projects.*`, `campaigns.*`, `research.run`, `researchSignals.list/get`, `playbooks.*` (campaign-scoped), `agentRuns.list/get`
- [ ] Frontend: stop-gap fixes so `IntelTab` / `ArchitectTab` compile against the new client (full redesign in Sprint 13)
- [ ] `shared/types`: add `ResearchSignal`, `Project`, `Campaign`; correct the `CampaignPlaybook` type to match `generate_node.py` output (PRD §12: code is ground truth)

### Friday Oct 2
- [ ] Update `tests/test_intel_agent.py` → `test_research_agent.py`; cover synthesise/write nodes and the research_questions path
- [ ] Update the backend queue round-trip test to assert the `research_run` payload shape matches the Python model
- [ ] Sprint review: POST `research/run` → worker picks up the job → `research_signals` row with the correct `project_id` → `agent_runs` shows complete → the frontend builds

---

## Sprint 11 — ICP Agent + Market Sizing Agent (Oct 5 – 9)

**Goal:** Both new Project-level agents run end-to-end from the API, degrade cleanly when inputs are missing, and write their outputs.

### Monday Oct 5
- [ ] Agent-service: shared `retrieve_research_node` (load the given `research_signal_id`, or the Project's latest; fail clearly if none exists)
- [ ] Agent-service: pull vault retrieval out of `nodes/architect/retrieve_node.py` into a shared `retrieve_vault_node` (pgvector top-8) for ICP and Architect to use

### Tuesday Oct 6
- [ ] ICP `generate_node`: Claude → firmographics, personas, pain points, buying triggers (PRD §4.5 schema); validate output with a Pydantic model
- [ ] ICP `store_node` → `icp_profiles` (with `workspace_id`, `project_id`, `research_signal_id`), plus `agent_runs` and a `credit_ledger` row (`icp_run`)
- [ ] `graphs/icp_agent.py` wired up; worker dispatches `icp_run`

### Wednesday Oct 7
- [ ] Market Sizing `scrape_node`: reuse the Research Firecrawl scraper on optional market-data URLs (0–5); skip when none are given
- [ ] Market Sizing `estimate_node`: TAM/SAM/SOM, each with methodology and assumptions; the prompt requires every number to be justified; Pydantic-validate
- [ ] Market Sizing `store_node` → `market_sizing_reports` + `agent_runs` + `credit_ledger` (`market_sizing_run`); worker dispatches `market_sizing_run`

### Thursday Oct 8
- [ ] Backend: `POST /projects/:projectId/agents/icp/run` and `/agents/market-sizing/run` (400 if the Project has no Research Signal yet)
- [ ] Backend: `GET /projects/:projectId/icp-profiles(/:id)` and `/market-sizing-reports(/:id)`
- [ ] `shared/types` + `lib/api.ts`: `IcpProfile`, `MarketSizingReport` and their API calls

### Friday Oct 9
- [ ] Tests: ICP and Market Sizing graphs (mocked Claude/Firecrawl), including the "no research signal" failure and "no market-data URLs" skip paths
- [ ] Backend isolation test: ICP/Market Sizing endpoints refuse access to another workspace's Project
- [ ] Sprint review: Research → ICP and Research → Market Sizing both work on one Project; both rows carry the correct `project_id`

---

## Sprint 12 — Architect Agent v2 + Credits & Audit Log (Oct 12 – 16)

**Goal:** Architect runs at Campaign level on combined Project intelligence, handles missing ICP/Market Sizing gracefully, checks its own output, and records which sources it used.

### Monday Oct 12
- [ ] Architect `retrieve_project_intel_node`: Research required (given ID or latest); ICP and Market Sizing optional (given ID or latest)
- [ ] Backend `architect/run`: accept optional `icp_profile_id` and `market_sizing_report_id` and forward them
- [ ] Architect `retrieve_vault_node`: build the query from the combined Research + ICP + Market Sizing intelligence

### Tuesday Oct 13
- [ ] Architect `generate_node`: prompt takes ICP and Market Sizing when present, plus the Campaign's goal and channels; each missing input becomes an entry in `risk_flags`
- [ ] Architect `validate_node` (new): self-review scores brand voice, strategic coherence and citation completeness; re-runs generate once if the score is below threshold

### Wednesday Oct 14
- [ ] Architect `store_node` → `campaign_playbooks` with `campaign_id` and FKs to the research/ICP/market-sizing rows actually used; `agent_runs` + `credit_ledger` (`architect_run`)
- [ ] Remove all remaining `market_signals` references from agent-service
- [ ] Update `test_architect_agent.py`: full intelligence, research-only (degraded) and validate-retry cases

### Thursday Oct 15
- [ ] Audit log: record every agent trigger, playbook approval, export, and (later) integration connect/disconnect with `user_id` + timestamp (PRD §9). Add a table if the schema lacks one
- [ ] Credit ledger rows carry `project_id` / `campaign_id` when applicable (PRD §4.10)

### Friday Oct 16
- [ ] Reuse check (backend integration test): two Campaigns under one Project, run Architect on both, and assert there's no second research/ICP/sizing run and that both playbooks reference the same source rows
- [ ] Sprint review: the full agent chain works from the API alone (Research → ICP → Market Sizing → Campaign → Architect → approve → export)

---

## Sprint 13 — Mission Control v2 (Oct 19 – 23)

**Goal:** Mission Control reflects the v2.0 hierarchy, with grouped tabs, Workspace/Project/Campaign selectors, and Realtime updates for all four agents. No polling.

### Monday Oct 19
- [ ] Zustand: extend `store/workspace.ts` with `selectedProjectId` / `selectedCampaignId` plus project/campaign lists
- [ ] `TopBar`: Workspace / Project / Campaign selectors (dropdowns that switch selection only; creation happens in chat)

### Tuesday Oct 20
- [ ] `MissionControlCanvas`: three tab groups (Workspace-level · Project Intelligence · Campaign Execution); the latter two are disabled with a "select or create…" prompt until something is selected
- [ ] Locked Builder/Analyst tabs keep the existing style
- [ ] `store/agent.ts`: `agent_runs` Realtime subscription filtered client-side by the selected project/campaign

### Wednesday Oct 21
- [ ] `ResearchTab` (replaces `IntelTab`): status badge, run history, expandable Research Signal with citations; Realtime on `research_signals`
- [ ] `IcpTab` (new): firmographics, persona cards, pain points, buying triggers; Realtime on `icp_profiles`

### Thursday Oct 22
- [ ] `MarketSizingTab` (new): TAM/SAM/SOM cards showing methodology and assumptions; Realtime on `market_sizing_reports`
- [ ] `ArchitectTab`: campaign-scoped playbook with channel tabs, approval gate, export (PDF/Markdown/clipboard), version history, and a "sources used" panel

### Friday Oct 23
- [ ] Confirm Realtime publication covers the new tables (schema §REALTIME)
- [ ] Manual QA with two Campaigns in one Workspace: switching between them never mixes up status badges
- [ ] Sprint review: every agent's output appears live in the right tab without refreshing

---

## Sprint 14 — Google Drive + Notion Integrations (Oct 26 – 30)

**Goal:** Connect a provider once, paste a link, and the document is ingested. Tokens are encrypted, only the backend holds secrets, and agent-service gets tokens through an internal endpoint.

### Monday Oct 26
- [ ] Register Google OAuth (Drive read-only scope) and Notion public integration apps; add `GOOGLE_CLIENT_ID/SECRET`, `NOTION_CLIENT_ID/SECRET`, `INTEGRATION_TOKEN_ENCRYPTION_KEY`, `INTERNAL_API_KEY` to `.env.example` and `render.yaml`
- [ ] Backend: token encryption helper (AES-256-GCM) for `workspace_integrations` token columns

### Tuesday Oct 27
- [ ] Backend: `GET /api/integrations/:provider/connect` (signed `state` carrying workspace_id + user_id) and the public `GET /api/integrations/:provider/callback`
- [ ] Backend: `GET /workspaces/:id/integrations` (reads the restricted status view only) and `DELETE /workspaces/:id/integrations/:provider`

### Wednesday Oct 28
- [ ] Backend: internal `GET /internal/integrations/:integrationId/token`, guarded by `INTERNAL_API_KEY` rather than a user JWT; refreshes the Google token when expired
- [ ] Backend: `POST /vault/drive` (file ID or share link) and `POST /vault/notion` (page URL/ID) → `vault_ingest` jobs
- [ ] Audit log entries for connect and disconnect

### Thursday Oct 29
- [ ] Agent-service vault `extract_node`: `google_drive` (Drive export API: Docs → text, PDF → pypdf) and `notion` (blocks API, recursive) branches that fetch their token from the internal endpoint
- [ ] Chunks tagged with `source_type` and `external_file_id`
- [ ] Tests: Drive/Notion extract with mocked APIs; token-endpoint auth rejects requests without the internal key

### Friday Oct 30
- [ ] Frontend `VaultTab`: Connect Google Drive / Connect Notion buttons, connection status, disconnect
- [ ] Security check: no user JWT can read token columns (test through the anon key)
- [ ] Sprint review: connect Drive → paste link → document reaches `ready` → chunks are searchable by Architect

---

## Sprint 15 — Vimi Chat v2 Flow + Admin Credits (Nov 2 – 6)

**Goal:** Vimi Chat walks through the full PRD §6 conversation flow and remains the only place users write data.

### Monday Nov 2
- [ ] `store/chat.ts`: add phases `PROJECT_CREATE`, `RESEARCH_SETUP/RUNNING`, `ICP_SETUP/RUNNING`, `MARKET_SIZING_SETUP/RUNNING`, `CAMPAIGN_CREATE`, `ARCHITECT_SETUP/RUNNING`; remove the v1.0 intel phases
- [ ] `VAULT_UPLOAD`: add Drive/Notion connect + paste-link options

### Tuesday Nov 3
- [ ] `PROJECT_CREATE` → `RESEARCH_SETUP`: collect competitor URLs, keywords, and optional research questions; trigger the run and point to the Research tab
- [ ] Move to the ICP step when the Research `agent_runs` row completes (Realtime event, not polling)

### Wednesday Nov 4
- [ ] `ICP_SETUP` and `MARKET_SIZING_SETUP`: Build/Skip chips, optional market-data URLs
- [ ] `CAMPAIGN_CREATE`: name, goal chips, channel multi-select → create the Campaign → `ARCHITECT_SETUP` (confirm sources) → run

### Thursday Nov 5
- [ ] `ACTIVE` quick actions: new Campaign in this Project, re-run Research/ICP/Market Sizing, switch or create a Project
- [ ] Credit soft-cap warning in chat when workspace usage passes the configured threshold (PRD §4.10)

### Friday Nov 6
- [ ] Admin/credits dashboard: usage broken down by all five action types, per-workspace totals vs allocation, CSV export
- [ ] Sprint review: a brand-new user reaches a playbook purely through chat; all copy says "Vimi", never "Claude" or "AI"

---

## Sprint 16 — Migration, Hardening, Deploy, Sign-off (Nov 9 – 13)

**Goal:** Production runs v2.0 with any v1.0 data migrated, isolation proven, and all PRD §11 criteria passing.

### Monday Nov 9
- [ ] Decide whether production has v1.0 data. If yes: apply the enum renames (`intel`→`research`, `intel_run`→`research_run`) with raw SQL, not `prisma db push`
- [ ] Backfill (if needed): a "General" Project and a "Migrated Campaign" per workspace with output; move `market_signals` → `research_signals` and attach playbooks; then make `project_id`/`campaign_id` required

### Tuesday Nov 10
- [ ] Rehearse the migration on a Supabase branch before touching production
- [ ] Extend the workspace isolation suite to projects, campaigns, research_signals, icp_profiles, market_sizing_reports, workspace_integrations, and the workspace-mismatch triggers

### Wednesday Nov 11
- [ ] Deploy: Render (backend + agent-service with new env vars), Vercel (frontend); set the OAuth redirect URIs for the production domain
- [ ] Run the production migration; smoke-test `/api/health`, the queue round-trip, and one run of each agent

### Thursday Nov 12
- [ ] End-to-end run of PRD §11 criteria 1–8 on production with a fresh account (one Drive- or Notion-ingested document included)
- [ ] Fix-forward any issues found

### Friday Nov 13
- [ ] Update `CLAUDE.md`, `.env.example` files and the PRD migration notes to the shipped state
- [ ] Sprint review: MVP1 v2.0 shipped ✓

---

## Critical Path

```
S10 Research Agent ──► S11 ICP + Market Sizing ──► S12 Architect v2 ──► S13 Mission Control v2 ──► S15 Chat v2 ──► S16 Ship
                                                                        S14 Drive/Notion (independent after S10) ──┘
```

- Sprint 10 blocks everything: until `research_run` is handled, no downstream agent has input.
- Sprint 14 (integrations) depends only on the vault pipeline, so it can move earlier or run alongside Sprints 11–13 if there's a second developer.
- Sprint 13 frontend scaffolding (selectors, tab groups) can start during Sprint 12, since it only needs the API contracts, which are already fixed in the PRD.

## Risks

| Risk | Mitigation |
|---|---|
| Google OAuth app verification for Drive scopes takes time | Register the app in Sprint 10; use test users until verified |
| Architect `validate_node` retries double Claude cost and latency | Cap at one retry; record the validation score on the run for tuning |
| Market Sizing produces numbers it can't back up | Pydantic check requires methodology and assumptions on every estimate; prompt forbids unsupported figures |
| Production v1.0 data migration | Rehearse on a Supabase branch (Sprint 16 Tue); raw-SQL enum renames only |

## Out of Scope Reminder

Same as PRD §10: Builder and Analyst agents, in-app Drive/Notion file picker, CRM integrations, ad-platform push, scheduled runs, credit hard-gating, Stripe billing, and mobile layout are all deferred.
