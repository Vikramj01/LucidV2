# Lucid v2 — Claude Code Context

## What This Is

**Lucid** — Agentic B2B marketing engine, built on three product pillars:

1. **Strategy** — research and understand the market, define the market, define the ICP(s).
2. **Channel & Content Selection** — for that market/ICP, recommend the right channel and the right type of content/medium for it.
3. **Measurement** — connect ad platforms, Google Analytics, and social platforms; pull performance data back in; report on it; close the loop.

Between pillars 2 and 3 is a **handoff gap**, not a build target: the campaign passes to the client's agency, the client themselves, or directly into a platform. Lucid recommends the channel and content — it does not produce the assets or run the campaign itself.

Full framework, current build-vs-gap mapping, and roadmap: **`docs/PRODUCT_FRAMEWORK.md`** — treat it as the product source of truth; this file is the technical/engineering reference.

**What ships today (MVP1):** two agents — **Intel Agent** (Strategy: market research) and **Architect Agent** (Strategy synthesis + Channel & Content Selection, producing a campaign playbook). The handoff pillar is already covered by the existing "Approve + Export" flow. **Measurement (Analyst Agent)** is the next build phase — not yet implemented. The previously-planned **Builder Agent** (in-house asset generation) is retired from the roadmap; see `docs/PRODUCT_FRAMEWORK.md` for why.

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
| AI (Strategy) | `claude-sonnet-4-20250514` via Anthropic SDK |
| Hosting | Vercel (frontend) + Render (backend + agent-service) |

---

## UI Architecture

**Split-screen layout — two fixed panels:**

- **Left (40%) — Vimi Chat Panel:** Conversational interface. User talks to Vimi to configure workspaces, approve outputs, and override agent decisions. This is the only input layer.
- **Right (60%) — Mission Control Canvas:** Real-time view of all agent activity. Shows agent status, Market Signals (Intel — Strategy), Campaign Playbook with channel/content recommendations and the Approve + Export handoff gate (Architect — Channel & Content Selection + Handoff), and performance reads (Analyst — Measurement, not yet built). Tabbed by agent. Updates via Supabase Realtime subscriptions — no polling.

Human-in-the-loop gates appear in the Mission Control panel, not in chat. User must explicitly approve before any campaign is published or any budget is spent.

---

## Data Hierarchy

```
Organization (payer, holds credit pool)
  └── Workspace (one per client/brand — isolated data)
        ├── Brand Voice Vault (RAG — pgvector)
        ├── Market Signals (Intel Agent output — Strategy pillar)
        ├── Campaign Playbooks (Architect Agent output — Channel & Content Selection; Approve + Export = Handoff)
        └── Performance Logs (Analyst Agent output — Measurement pillar, not yet built)
  └── Users (RBAC: org_admin | workspace_member)
```

All Supabase queries use Row-Level Security. Never bypass RLS. Never query across workspace boundaries.

---

## Agent Architecture (MVP1 Scope)

MVP1 includes **Intel Agent and Architect Agent only**, covering the Strategy and Channel & Content Selection pillars. Analyst Agent (Measurement) is the next phase. Builder Agent is retired — see `docs/PRODUCT_FRAMEWORK.md`.

**Intel Agent** (Strategy): Takes competitor URLs + industry keywords → Firecrawl scrape → structured Market Signal JSON → stored in `market_signals` table.

**Architect Agent** (Strategy synthesis + Channel & Content Selection): Takes Market Signals + Brand Voice Vault context (RAG) → Claude Sonnet → Campaign Playbook (winning angle/ICP + per-channel content recommendations) → stored in `campaign_playbooks` table. The existing Approve + Export flow on this agent's output fulfills the Handoff pillar.

**Job flow:**
1. Backend receives trigger (user action in chat)
2. Backend enqueues job to Redis with `workspace_id` + `job_type`
3. Agent-service worker picks up job, runs LangGraph graph
4. Agent-service writes results directly to Supabase
5. Frontend receives update via Supabase Realtime

---

## Key Conventions

- **Language:** TypeScript everywhere in frontend and backend. Python 3.11+ in agent-service with type hints throughout.
- **API auth:** All backend routes require `Authorization: Bearer <supabase_jwt>` except `/api/health`.
- **Error format:** `{ error: string, code: string }` — never expose raw stack traces to client.
- **Agent status:** Always write a status record to `agent_runs` table at start, on completion, and on failure. Frontend reads this for Mission Control display.
- **Workspace isolation:** Every database write from agent-service must include `workspace_id`. No exceptions.
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
| Brief/ICP/Channel flow | No | Replaced by Brand Voice Vault + Intel Agent |
| Design tokens | Yes | Extend with Mission Control dark theme |

---

## Build Sequence (MVP1)

1. Supabase schema + RLS policies
2. Auth + multi-tenant setup (Org → Workspace → User)
3. Brand Voice Vault ingestion (PDF/URL → chunks → pgvector)
4. Redis queue connection (backend ↔ agent-service)
5. Intel Agent (Firecrawl → Market Signal JSON)
6. Architect Agent (RAG + Claude → Campaign Playbook)
7. Mission Control UI (Realtime agent status + output display)
8. Vimi Chat Panel (trigger actions, approve outputs)
9. Credit ledger (track, don't gate)
10. Admin panel

---

## Critical Rules

- Never call LangGraph or Firecrawl from the Express backend. Always via Redis → agent-service.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the frontend.
- Never skip RLS. Test isolation between workspaces before shipping any feature.
- Never use polling for real-time updates. Use Supabase Realtime channels.
- Mission Control is read-only — it displays agent output. Vimi Chat is the only write surface for user intent.
