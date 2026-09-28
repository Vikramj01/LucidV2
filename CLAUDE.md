# Lucid v2 — Claude Code Context

## What This Is

**Lucid** — Agentic B2B marketing engine. AI agents run per workspace, producing market research, ideal customer profiles, market sizing, campaign strategy, and (in later phases) multimedia assets and performance analysis.

**Source of truth:** `docs/Lucid_v2_PRD_MVP1.md` (v2.0). Current delivery plan: `docs/SPRINT_PLAN_V2.md`.

**Vimi** — The AI strategist persona. Always use "Vimi" in user-facing copy, never "Claude" or "AI".

**ViMi Digital** — The company. Multi-tenant SaaS: Agencies manage multiple client Workspaces; B2B brands manage one.

---

## Repo Structure (Monorepo)

```
lucid-v2/
  frontend/          # Next.js 15 App Router — Vercel
  backend/           # Express 4 + Node.js — Render (Web Service)
  agent-service/     # FastAPI + LangGraph (Python) — Render (Worker Service)
  shared/            # Shared TypeScript types only
```

Do NOT put agent orchestration logic in the backend. Do NOT put API route handling in agent-service. Communication between backend and agent-service is via Redis queue only.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 App Router, Tailwind CSS, Zustand |
| Backend | Express 4, Node.js, Prisma 5 |
| Agent Service | FastAPI, LangGraph (Python 3.11) |
| Database | Supabase (PostgreSQL + pgvector + RLS) |
| Auth | Supabase Auth — JWT via `supabase.auth.getUser()`. Never use `jwt.verify()`. |
| Queue | Upstash Redis — backend enqueues jobs; agent-service consumes them |
| Embeddings | OpenAI `text-embedding-3-small` |
| Web Research | Firecrawl API |
| Contracts | `shared/types/index.ts` (TS) ↔ `agent-service/app/models/` (Pydantic) — keep in sync |
| AI (Strategy) | `claude-sonnet-4-20250514` via Anthropic SDK |
| Hosting | Vercel (frontend) + Render (backend + agent-service) |

---

## UI Architecture

**Split-screen layout — two fixed panels:**

- **Left (40%) — Vimi Chat Panel:** Conversational interface. User talks to Vimi to configure workspaces, approve outputs, and override agent decisions. This is the only input layer.
- **Right (60%) — Mission Control Canvas:** Real-time view of all agent activity. Tabs grouped by scope: Workspace (Overview, Vault), Project Intelligence (Research, ICP, Market Sizing), Campaign Execution (Architect; Builder and Analyst locked). Updates via Supabase Realtime subscriptions — no polling.

Human-in-the-loop gates appear in the Mission Control panel, not in chat. User must explicitly approve before any campaign is published or any budget is spent.

---

## Data Hierarchy

```
Organisation (payer, holds credit pool)
  └── Workspace (one per client/brand — isolated data)
        ├── Brand Voice Vault (RAG — pgvector; PDF / URL / text / Google Drive / Notion)
        ├── Workspace Integrations (Drive / Notion OAuth — tokens encrypted, backend-only)
        └── Project (reusable knowledge container for an initiative)
              ├── research_signals       (Research Agent)
              ├── icp_profiles           (ICP Agent)
              ├── market_sizing_reports  (Market Sizing Agent)
              └── Campaign (one execution push: goal + channels)
                    └── campaign_playbooks (Architect Agent)
  └── Users (RBAC: org_admin | workspace_member)
```

Research, ICP and Market Sizing run once per Project and are reused by every Campaign under it. Projects and Campaigns soft-delete (archive) only.

All Supabase queries use Row-Level Security. Never bypass RLS. Never query across workspace boundaries.

---

## Agent Architecture (MVP1 Scope — PRD v2.0)

MVP1 is the "strategic brain": **Research, ICP, Market Sizing, Architect** agents plus vault ingestion. Builder (Phase 2) and Analyst (Phase 3) are out of scope.

| Job type | Scope | Graph (agent-service `app/graphs/`) | Writes |
|---|---|---|---|
| `research_run` | Project | scrape → extract → synthesise → write → store | `research_signals` |
| `icp_run` | Project | retrieve research → retrieve vault → generate → store | `icp_profiles` |
| `market_sizing_run` | Project | retrieve research → scrape (optional) → estimate → store | `market_sizing_reports` |
| `architect_run` | Campaign | retrieve project intel → retrieve vault → generate → validate → store | `campaign_playbooks` |
| `vault_ingest` | Workspace | extract → chunk → embed → store | `vault_chunks` |

ICP and Market Sizing require a Research Signal. Architect requires Research; ICP and Market Sizing are optional (missing inputs become `risk_flags`, never a hard failure).

**Job flow:**
1. Backend receives trigger (user action in chat)
2. Backend enqueues job to Redis with `workspace_id` + `job_type` (payload shapes in `app/models/jobs.py`)
3. Agent-service worker validates the job, runs the LangGraph graph
4. Agent-service writes results directly to Supabase
5. Frontend receives update via Supabase Realtime

**Status (Sprint 10):** `research_run`, `architect_run` (research-only inputs) and `vault_ingest` are implemented. ICP and Market Sizing land in Sprint 11; Architect's project-intel and validate steps in Sprint 12.

---

## Key Conventions

- **Language:** TypeScript everywhere in frontend and backend. Python 3.11+ in agent-service with type hints throughout.
- **API auth:** All backend routes require `Authorization: Bearer <supabase_jwt>` except `/api/health`.
- **Error format:** `{ error: string, code: string }` — never expose raw stack traces to client.
- **Agent status:** Always write a status record to `agent_runs` table at start, on completion, and on failure. Frontend reads this for Mission Control display.
- **Workspace isolation:** Every database write from agent-service must include `workspace_id` (and `project_id` / `campaign_id` where the table has them). No exceptions.
- **Credit tracking:** Every agent action writes to `credit_ledger` table. MVP1 tracks but does not gate on credits.

---

## Environment Variables

```
# Backend (Render)
DATABASE_URL=            # Supabase pooled (port 6543)
DIRECT_URL=              # Supabase direct (port 5432)
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # backend only, never frontend
ANTHROPIC_API_KEY=
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=
NODE_ENV=production
PORT=3001

# Agent Service (Render)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=           # embeddings only
FIRECRAWL_API_KEY=
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=

# Frontend (Vercel)
NEXT_PUBLIC_API_URL=              # https://lucid-backend.onrender.com/api
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

---

## What to Port from V1

| V1 Component | Port? | Notes |
|---|---|---|
| Supabase auth flow | Yes | Same pattern — `supabase.auth.getUser()` |
| JWT middleware (`middleware/auth.js`) | Yes | Copy directly |
| Admin panel routes + controllers | Yes | Adapt to new schema |
| Prompt templates (PT-01 to PT-09, PTM-01 to PTM-05) | Selectively | Architect Agent will use adapted versions |
| Campaign generation logic | No | Replaced by LangGraph agent |
| Brief/ICP/Channel flow | No | Replaced by Brand Voice Vault + Research / ICP Agents |
| Design tokens | Yes | Extend with Mission Control dark theme |

---

## Build Sequence

Sprints 1–9 shipped v1.0 (Intel + Architect) and the v2.0 data model and Projects/Campaigns API (`docs/SPRINT_PLAN_MVP1.md`). Sprints 10–16 bring the rest of the stack to v2.0 — see `docs/SPRINT_PLAN_V2.md`.

**Schema changes:** write them as a SQL file in `docs/migrations/` and mirror them in `docs/Lucid_v2_schema.sql` and `backend/prisma/schema.prisma`. The user applies migrations to Lucid's database.

---

## Critical Rules

- Never call LangGraph or Firecrawl from the Express backend. Always via Redis → agent-service.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the frontend.
- Never skip RLS. Test isolation between workspaces before shipping any feature.
- Never use polling for real-time updates. Use Supabase Realtime channels.
- Mission Control is read-only — it displays agent output. Vimi Chat is the only write surface for user intent.
- Never use the Supabase MCP connector for Lucid. It is connected to a different project (AtlasV2), not Lucid's database. Write schema changes as SQL/Prisma in the repo; the user applies them to Lucid's database.
