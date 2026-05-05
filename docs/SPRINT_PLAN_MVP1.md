# Lucid v2 — MVP1 Sprint Plan
**Scope:** Intel Agent + Architect Agent + Brand Voice Vault + Mission Control UI  
**Start date:** 2026-05-05  
**Duration:** 7 weeks (35 working days)  
**Definition of done for MVP1:** A new user can sign up, upload brand documents, trigger both agents, receive a cited campaign playbook, approve it, and export it.

---

## Sprint Overview

| Sprint | Theme | Dates |
|---|---|---|
| 1 | Foundation — Monorepo, Schema, Auth | May 5–9 |
| 2 | Multi-tenancy — Org/Workspace API + Redis | May 12–16 |
| 3 | Brand Voice Vault — Ingestion Pipeline | May 19–23 |
| 4 | Intel Agent — Firecrawl → Market Signals | May 26–30 |
| 5 | Architect Agent — RAG + Claude → Playbook | Jun 2–6 |
| 6 | Frontend — Mission Control + Vimi Chat | Jun 9–13 |
| 7 | Admin Panel, Polish, Deployment | Jun 16–20 |

---

## Sprint 1 — Foundation (May 5–9)

**Goal:** Monorepo scaffolded, database live, auth working end-to-end.

### Monday May 5
- [ ] Create monorepo structure: `frontend/`, `backend/`, `agent-service/`, `shared/`
- [ ] Init Next.js 15 App Router in `frontend/` (TypeScript, Tailwind CSS)
- [ ] Init Express 4 + TypeScript in `backend/` with `ts-node` dev setup
- [ ] Init FastAPI + Python 3.11 in `agent-service/` with `pyproject.toml`
- [ ] Create `shared/types/` with initial TypeScript interfaces (Org, Workspace, Profile, AgentRun)
- [ ] Set up `.env.example` files for all three services

### Tuesday May 6
- [ ] Create Supabase project, enable `pgvector` extension
- [ ] Apply `docs/Lucid_v2_schema.sql` in full (all tables, enums, RLS, functions, triggers)
- [ ] Enable Supabase Realtime on: `agent_runs`, `market_signals`, `campaign_playbooks`, `vault_documents`
- [ ] Create `vault-documents` storage bucket (private, 20MB limit, PDF only)
- [ ] Verify RLS helper functions (`auth_org_id`, `is_org_admin`, `is_workspace_member`, `is_super_admin`) are installed

### Wednesday May 7
- [ ] Configure Supabase Auth: enable Magic Link + Google OAuth
- [ ] Frontend: auth pages — `/login`, `/signup` using `@supabase/ssr`
- [ ] Frontend: `middleware.ts` — protect all routes except `/login`, `/signup`
- [ ] Backend: port JWT middleware from V1 — validate `Authorization: Bearer <token>` via `supabase.auth.getUser()` (never `jwt.verify()`)
- [ ] Backend: `GET /api/health` — unauthenticated, returns `{ status: 'ok' }`

### Thursday May 8
- [ ] Supabase Auth: trigger auto-create `profiles` row on user signup (DB function + Auth hook)
- [ ] Backend: `POST /api/organisations` — create org + set caller as `org_admin`
- [ ] Backend: `GET /api/organisations/:id` — return org with workspace list
- [ ] Backend: `POST /api/organisations/:id/workspaces` — create workspace, add caller to `workspace_members`
- [ ] Backend: error format enforced: `{ error: string, code: string }` on all error responses

### Friday May 9
- [ ] Backend: `GET /api/workspaces/:id` + `PATCH /api/workspaces/:id`
- [ ] Write workspace isolation test: create two orgs, two workspaces, verify RLS blocks cross-workspace reads
- [ ] Frontend: `/onboarding` page — org name + type selection → workspace name → redirect to `/dashboard`
- [ ] Sprint review: auth flow works end-to-end, schema fully applied, isolation verified

---

## Sprint 2 — Multi-tenancy API + Redis (May 12–16)

**Goal:** Full backend API skeleton live. Redis queue connected. Vault upload routes ready for agent-service.

### Monday May 12
- [ ] Backend: set up Prisma 5 with Supabase connection strings (`DATABASE_URL` pooled port 6543, `DIRECT_URL` direct port 5432)
- [ ] Generate Prisma client from Supabase schema (introspect existing tables)
- [ ] Backend: add `orgId` and `workspaceId` extraction helpers from JWT + DB
- [ ] Backend: `GET /api/workspaces/:id/agent-runs` — list agent run history for workspace
- [ ] Backend: `GET /api/workspaces/:id/agent-runs/:runId` — single run status + output

### Tuesday May 13
- [ ] Backend: vault routes — `POST /api/workspaces/:id/vault/upload` (PDF → Supabase Storage → `vault_documents` record with status `queued`)
- [ ] Backend: vault routes — `POST /api/workspaces/:id/vault/url` (submit URL → `vault_documents` record)
- [ ] Backend: vault routes — `POST /api/workspaces/:id/vault/text` (submit free text → direct ingestion)
- [ ] Backend: `GET /api/workspaces/:id/vault` — list all vault documents with status
- [ ] Backend: `DELETE /api/workspaces/:id/vault/:docId` — delete document + trigger vector cleanup job

### Wednesday May 14
- [ ] Set up Upstash Redis connection in backend (`@upstash/redis`)
- [ ] Define Redis job schema (TypeScript type): `{ job_id, job_type, workspace_id, org_id, payload, created_at, priority }`
- [ ] Backend: `POST /api/workspaces/:id/agents/intel/run` — validate input, create `agent_runs` row (status `queued`), enqueue Redis job
- [ ] Backend: `POST /api/workspaces/:id/agents/architect/run` — same pattern, different `job_type`
- [ ] Test Redis enqueue: verify job appears in Upstash dashboard

### Thursday May 15
- [ ] Backend: output routes — `GET /api/workspaces/:id/market-signals` + `GET /api/workspaces/:id/market-signals/:sigId`
- [ ] Backend: output routes — `GET /api/workspaces/:id/playbooks` + `GET /api/workspaces/:id/playbooks/:pbId`
- [ ] Backend: `PATCH /api/workspaces/:id/playbooks/:pbId/approve` — set `status = 'approved'`, write `approved_by` + `approved_at`
- [ ] Backend: `GET /api/workspaces/:id/playbooks/:pbId/export` — return raw playbook content (PDF generation deferred to Sprint 6)
- [ ] Backend: `GET /api/workspaces/:id/credits` — aggregate `credit_ledger` for workspace

### Friday May 16
- [ ] Backend: `GET /api/organisations/:id/credits` — aggregate credit_ledger across all workspaces in org
- [ ] Backend: admin routes (super_admin guard) — `GET /api/admin/stats`, `GET /api/admin/organisations`, `GET /api/admin/users`
- [ ] Write integration test: enqueue Intel job → verify `agent_runs` row in DB with status `queued`
- [ ] Sprint review: all API contracts from PRD Section 7 implemented (agent-service not yet consuming jobs)

---

## Sprint 3 — Brand Voice Vault Ingestion Pipeline (May 19–23)

**Goal:** Vault ingestion fully working. Upload PDF/URL/text → chunked → embedded → stored in pgvector.

### Monday May 19
- [ ] `agent-service`: FastAPI app setup with `uvicorn`, health endpoint
- [ ] `agent-service`: Upstash Redis consumer — poll queue, dispatch by `job_type` to correct graph
- [ ] `agent-service`: Supabase client using `SUPABASE_SERVICE_ROLE_KEY` (service role — intentional RLS bypass, all writes include `workspace_id`)
- [ ] `agent-service`: `agent_run` status writer helper — call at job start (`running`), completion (`complete`), failure (`failed`) with `error_message`
- [ ] Define `VaultIngestJob` Pydantic model

### Tuesday May 20
- [ ] `agent-service`: LangGraph vault ingestion graph scaffold
- [ ] `extract_node` for PDF: download from Supabase Storage → `pypdf` text extraction, update `vault_documents.status = 'processing'`
- [ ] `extract_node` for URL: Firecrawl `scrape` call → markdown text
- [ ] `extract_node` for free_text: pass-through with no external call
- [ ] Unit test: PDF extraction produces non-empty text string

### Wednesday May 21
- [ ] `chunk_node`: split text into ~500-token chunks with 50-token overlap (use `tiktoken` for counting)
- [ ] `embed_node`: batch embed chunks via `openai.embeddings.create(model="text-embedding-3-small")` — handle rate limits with exponential backoff
- [ ] Unit test: chunk output matches expected count and overlap for a known document

### Thursday May 22
- [ ] `store_node`: upsert `vault_chunks` rows (each with `workspace_id`, `document_id`, `chunk_index`, `content`, `embedding`)
- [ ] `store_node`: update `vault_documents.chunk_count`, set `status = 'ready'`
- [ ] On any node failure: set `vault_documents.status = 'failed'`, write `error_message`
- [ ] Test Supabase Realtime: `vault_documents` status change fires `UPDATE` event

### Friday May 23
- [ ] End-to-end vault test: upload a real PDF → consume Redis job → verify chunks stored + `status = 'ready'`
- [ ] End-to-end vault test: submit URL → chunks embedded
- [ ] Verify `retrieve_vault_context` RPC function works: embed a test query → returns top-8 chunks by cosine similarity
- [ ] Sprint review: vault ingestion works for all three source types; RAG retrieval confirmed

---

## Sprint 4 — Intel Agent (May 26–30)

**Goal:** Intel Agent fully operational. User submits competitor URLs → Market Signal JSON written to DB → Realtime fires.

### Monday May 26
- [ ] `agent-service`: Intel Agent LangGraph graph scaffold (5 nodes: scrape, extract, synthesise, write, store)
- [ ] Define `IntelJob` Pydantic model (competitor URLs, industry keywords, workspace context)
- [ ] `scrape_node`: Firecrawl parallel scrape per URL — `asyncio.gather` with timeout per URL; collect raw markdown per competitor
- [ ] Handle Firecrawl errors per-URL gracefully (log, continue with remaining URLs)

### Tuesday May 27
- [ ] `extract_node`: Claude Sonnet call per competitor — prompt extracts `key_messaging`, `target_audience`, `content_themes`, `primary_cta` as structured JSON
- [ ] Use Anthropic SDK with `claude-sonnet-4-20250514` model
- [ ] Add prompt caching (`cache_control: ephemeral`) on the system prompt block to reduce cost
- [ ] Unit test: extract_node returns valid `competitor_profile` dict for sample markdown

### Wednesday May 28
- [ ] `synthesise_node`: Claude Sonnet call with all competitor profiles — prompt identifies `market_gaps`, `intent_triggers`, `recommended_angles`
- [ ] Prompt references workspace brand context (fetched from vault chunks at job start — top-5 by similarity to industry keywords)
- [ ] Unit test: synthesise_node output contains all three fields, non-empty

### Thursday May 29
- [ ] `write_node`: assemble full Market Signal JSON matching PRD Section 4.3 schema
- [ ] `store_node`: insert `market_signals` row with all fields + `workspace_id`
- [ ] `store_node`: update `agent_runs` status to `complete`, set `completed_at`
- [ ] `store_node`: call `deduct_credits` Supabase function — 3 credits per Intel run
- [ ] Test Supabase Realtime: `market_signals` INSERT fires update event

### Friday May 30
- [ ] End-to-end Intel Agent test: trigger via backend API → Redis job → full graph runs → `market_signals` row in DB
- [ ] Verify `agent_runs` status transitions: `queued → running → complete`
- [ ] Verify credit ledger row written for the run
- [ ] Test failure path: pass invalid URLs → `agent_runs.status = 'failed'`, `error_message` populated
- [ ] Sprint review: Intel Agent fully functional, signal appears in DB with correct structure

---

## Sprint 5 — Architect Agent (Jun 2–6)

**Goal:** Architect Agent fully operational. Market Signals + Brand Voice → Campaign Playbook with self-validation pass written to DB.

### Monday Jun 2
- [ ] `agent-service`: Architect Agent LangGraph graph scaffold (5 nodes: retrieve, strategy, playbook, validate, store)
- [ ] Define `ArchitectJob` Pydantic model (market_signal_id, campaign_goal, channels, workspace_id)
- [ ] `retrieve_node`: call `retrieve_vault_context` Supabase RPC with query embedding derived from campaign goal + market signal keywords — fetch top-8 chunks
- [ ] Fetch latest `market_signals` row for workspace

### Tuesday Jun 3
- [ ] `strategy_node`: Claude Sonnet call — synthesise brand vault context + market signals → `winning_angle` (1–2 sentences) + `channel_prioritisation` + `target_persona`
- [ ] Prompt uses V1 prompt templates PT-01/PT-02 as base, adapted for LangGraph context injection
- [ ] Every recommendation in prompt must reference a source (competitor insight or brand doc chunk)

### Wednesday Jun 4
- [ ] `playbook_node`: Claude Sonnet call per selected channel — produce full playbook section for each channel in `channels` array
- [ ] Each channel section: `strategy_rationale` (cited), `campaign_phases`, `messaging_framework` (hero/supporting/proof), `ad_copy_variants` (3 per format), `success_metrics`
- [ ] Assemble `playbook_content` JSONB matching PRD Section 4.4 + schema structure

### Thursday Jun 5
- [ ] `validate_node`: structured self-review Claude Sonnet call — checklist: 3 brand voice consistency checks, 3 strategic coherence checks, citation completeness (every recommendation has a source)
- [ ] If validation score < threshold: inject critique into `playbook_node` and re-run once
- [ ] `store_node`: insert `campaign_playbooks` row (`status = 'draft'`), update `agent_runs`, deduct 5 credits
- [ ] Test Supabase Realtime: `campaign_playbooks` INSERT fires update event

### Friday Jun 6
- [ ] End-to-end Architect Agent test: trigger → Redis → full graph → playbook in DB
- [ ] Verify validation re-run logic fires when score is below threshold (mock low-score scenario)
- [ ] Verify credit ledger row written for the run
- [ ] Full pipeline test: vault upload → Intel Agent → Architect Agent → playbook in DB (complete flow)
- [ ] Sprint review: both agents fully functional, end-to-end pipeline confirmed

---

## Sprint 6 — Frontend: Mission Control + Vimi Chat (Jun 9–13)

**Goal:** Full UI live — dark split-screen layout, Realtime subscriptions, 10-phase chat flow, approval gate, export.

### Monday Jun 9
- [ ] Design tokens: configure Tailwind with all values from PRD Section 5 (backgrounds, surfaces, borders, accent, status colours, locked colour)
- [ ] Typography: install DM Sans + Geist Mono, configure in Tailwind
- [ ] App shell: top bar (logo + workspace name + user menu), split-screen layout (40/60)
- [ ] Zustand store: workspace state, agent run state, chat phase state
- [ ] Supabase client setup in frontend (anon key only, never service role)

### Tuesday Jun 10
- [ ] Vimi Chat Panel: message history rendering (user + Vimi bubbles)
- [ ] Vimi Chat Panel: input bar (text, file upload trigger, chip selectors)
- [ ] Implement all 10 conversation phases (`WELCOME` → `ARCHITECT_RUNNING`) as a state machine
- [ ] Phase `VAULT_UPLOAD`: file picker → `POST /api/workspaces/:id/vault/upload`, show queued status
- [ ] Phase `VAULT_COMPLETE`: chips — "Add more" or "Continue"
- [ ] Vimi status update messages: plain-English agent status updates (e.g. "I've sent the Intel Agent…")

### Wednesday Jun 11
- [ ] Mission Control: 4-tab navigation (Intel, Architect, Builder🔒, Analyst🔒)
- [ ] Locked tab style: greyed label, lock icon, tooltip with phase label + waitlist CTA, frosted overlay on tab content
- [ ] Intel tab: agent status badge (Idle/Running/Complete/Failed with pulse animation on Running), run history (last 5), expandable market signal sections (competitor profiles, market gaps, intent triggers, angles)
- [ ] Supabase Realtime subscription: `agent_runs:workspace_id=eq.{id}` → update status badges
- [ ] Supabase Realtime subscription: `market_signals:workspace_id=eq.{id}` → update Intel tab content

### Thursday Jun 12
- [ ] Architect tab: agent status badge, rendered markdown playbook (channel-tabbed), version history list
- [ ] Approval gate: "Approve Playbook" button → `PATCH /api/workspaces/:id/playbooks/:pbId/approve` → button becomes "Approved ✓"
- [ ] Export: "Export PDF" → call `/api/workspaces/:id/playbooks/:pbId/export?format=pdf`, trigger download; "Export Markdown" → same with `format=md`; "Copy to Clipboard" → copy raw markdown
- [ ] Supabase Realtime subscription: `campaign_playbooks:workspace_id=eq.{id}` → update Architect tab
- [ ] Credit usage bar: current balance / monthly allocation from `GET /api/organisations/:id/credits`

### Friday Jun 13
- [ ] Workspace selector dropdown (Agency Admins only — show all workspaces in org)
- [ ] Intel tab: each data point shows its source URL (cited inline)
- [ ] Architect tab: each channel recommendation cites its source market signal or vault doc
- [ ] `vault_documents` Realtime subscription: update ingestion status in Vimi Chat during `VAULT_UPLOAD` phase
- [ ] Sprint review: full UI walkthrough — onboarding → vault → agents → Mission Control → approve → export

---

## Sprint 7 — Admin Panel, Polish, Deployment (Jun 16–20)

**Goal:** Admin views complete, soft cap warning live, all services deployed, MVP1 success criteria met.

### Monday Jun 16
- [ ] Admin panel (`/admin` — super_admin only): platform stats (total orgs, users, agent runs, credits used this month)
- [ ] Admin panel: organisations table (name, type, credit balance, workspace count, created date)
- [ ] Admin panel: users table (email, role, org, status, last login)
- [ ] Guard: redirect non-super_admin away from `/admin`

### Tuesday Jun 17
- [ ] Credit ledger dashboard (org admin view at `/settings/credits`)
- [ ] Total credits used this month per workspace (bar chart or table)
- [ ] Breakdown by action type (`intel_run`, `architect_run`, `vault_ingest`)
- [ ] Running total vs. monthly `credit_cap` allocation
- [ ] CSV export: fetch all ledger rows for org this month, generate and download CSV

### Wednesday Jun 18
- [ ] Soft cap warning: if workspace `credit_ledger` total exceeds `workspace.credit_soft_cap`, Vimi Chat displays a warning message on next interaction
- [ ] Playbook export — PDF generation: use `@react-pdf/renderer` or server-side `puppeteer` to render playbook markdown as PDF
- [ ] Final workspace isolation security test: two orgs, verify zero cross-contamination on all Supabase queries
- [ ] Audit log review: verify every agent run, approval, and export has a `user_id` + timestamp record in `agent_runs`

### Thursday Jun 19
- [ ] Vercel deployment: `frontend/` — set all `NEXT_PUBLIC_*` env vars, verify build passes
- [ ] Render deployment: `backend/` as Web Service — set all backend env vars, verify `/api/health` returns 200
- [ ] Render deployment: `agent-service/` as Worker Service — set all agent-service env vars, verify Redis consumer starts
- [ ] Smoke test on production URLs: sign up → onboarding → vault upload → Intel run

### Friday Jun 20
- [ ] End-to-end production test: complete MVP1 success criteria checklist (PRD Section 11)
  - [ ] 1. Create Organisation and Workspace
  - [ ] 2. Upload brand documents, see them processed
  - [ ] 3. Trigger Intel Agent, see Market Signals in Mission Control
  - [ ] 4. Trigger Architect Agent, receive cited Campaign Playbook
  - [ ] 5. Approve playbook, export as PDF and Markdown
  - [ ] 6. Agency Admin sees credit usage across all workspaces
- [ ] Fix any blockers from production smoke test
- [ ] Sprint review: MVP1 shipped ✓

---

## Critical Path

The following sequence is strictly ordered — each item depends on the one before:

```
Schema (S1D2)
  → Auth (S1D3)
    → Org/Workspace API (S1D4, S2)
      → Redis queue (S2D3)
        → agent-service worker (S3D1)
          → Vault ingestion (S3)
            → Intel Agent (S4)
              → Architect Agent (S5)
                → Mission Control UI (S6)
                  → Deployment (S7D4)
```

Frontend work (Sprint 6) can begin scaffolding in parallel from Sprint 1 Day 1 (app shell, design tokens, auth pages). Mission Control data display requires Sprint 4–5 to complete first.

---

## Out of Scope Reminder

Do not build or scaffold in MVP1:
- Builder Agent, Analyst Agent
- CRM integrations, ad platform push
- Scheduled agent runs
- Credit hard-gating
- Stripe billing
- Mobile layout (desktop-first, min 1280px)
