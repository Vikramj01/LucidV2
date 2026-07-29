# Lucid v2 — Product Requirements Document
## MVP1: The Strategic Brain

**Product:** Lucid v2
**Company:** ViMi Digital
**Version:** 2.0
**Scope:** MVP1 — Research Agent + ICP Agent + Market Sizing Agent + Architect Agent + Brand Voice Vault (PDF/URL/text + Google Drive/Notion) + Project/Campaign hierarchy + Mission Control UI

> **v2.0 changelog:** Supersedes v1.0's two-agent scope. v1.0 shipped Intel Agent + Architect Agent only, with Market Signals and Campaign Playbooks living flat under Workspace. v2.0 redefines MVP1 to the full four-agent strategist (Research, ICP, Market Sizing, Architect) operating over a new Project → Campaign hierarchy, so research built for one campaign is reusable across every other campaign in the same project. Builder Agent and Analyst Agent remain out of scope — still Phase 2 / Phase 3, untouched by this revision. Everything in this document reflects the target state; see `/root/.claude/plans/okay-so-what-we-re-unified-rabin.md` for the engineering implementation plan that gets the existing v1.0 codebase here.

---

## 1. Product Overview

Lucid v2 is an agentic B2B marketing engine. It operates through four specialised AI agents that run autonomously per client workspace: the Builder Agent (multimedia production) and the Analyst Agent (performance optimisation) are future phases. **MVP1 ships the strategic brain in full**: the **Research Agent** (market and competitive research), the **ICP Agent** (ideal customer profile synthesis), the **Market Sizing Agent** (TAM/SAM/SOM estimation), and the **Architect Agent** (campaign strategy).

**The core value proposition of MVP1:** A user uploads their brand documents, connects competitor URLs and (optionally) their own Drive/Notion knowledge base, and starts a Project. Lucid autonomously researches the competitive landscape, builds ideal customer profiles, sizes the addressable market, and synthesises all of it with brand context into a structured, cited multi-channel campaign strategy — without a human strategist doing the work. Critically, that research, ICP, and market-sizing work is done **once per Project** and reused automatically across every Campaign built under it, so a marketer running a second or third campaign for the same initiative isn't starting from zero.

The platform is multi-tenant, built for marketing agencies managing multiple client brands, and for individual B2B companies managing their own brand.

---

## 2. User Personas

### Agency Admin
- Manages the Organisation account and billing
- Creates and oversees multiple client Workspaces, each with its own Projects and Campaigns
- Reviews credit consumption across all workspaces
- Has full read/write access to all workspaces

### Workspace Member (Client User)
- Works within a single assigned Workspace
- Configures Brand Voice Vault (incl. Drive/Notion connections), creates Projects and Campaigns, triggers agents, reviews outputs
- Cannot see other workspaces or billing information

### Super Admin (Internal — ViMi Digital)
- Platform-level access for support and operations
- Manages all organisations, users, and usage logs
- Set via `Profile.role = 'super_admin'` in Supabase directly

---

## 3. Data Hierarchy

```
Organisation
├── credit_pool (balance, soft_cap_per_workspace)
├── billing (Stripe customer, plan)
└── Workspaces[]
      ├── brand_voice_vault[]        (RAG documents — pdf, url, free_text, google_drive, notion)
      ├── integrations[]             (Google Drive / Notion OAuth connections)
      ├── agent_runs[]               (status log for Mission Control, workspace-wide view)
      ├── credit_ledger[]            (per-action usage log)
      ├── Users[]                    (members of this workspace)
      └── Projects[]                 (reusable knowledge container, e.g. "Q3 EU Expansion")
            ├── research_signals[]     (Research Agent outputs)
            ├── icp_profiles[]         (ICP Agent outputs)
            ├── market_sizing_reports[] (Market Sizing Agent outputs)
            └── Campaigns[]            (an individual execution push, e.g. "LinkedIn ABM Push")
                  └── campaign_playbooks[]  (Architect Agent outputs, versioned)
```

Every database table includes `workspace_id`, even tables that also carry `project_id`/`campaign_id` — this is denormalized deliberately so Row-Level Security can enforce workspace isolation directly on every table, with database triggers guaranteeing the denormalized `workspace_id` never drifts from its parent Project/Campaign. All Supabase queries enforce RLS — no cross-workspace data access under any circumstance, and no cross-project or cross-campaign leakage within a workspace either.

Brand Voice Vault stays at the **Workspace** level, not Project — brand voice, tone, and positioning are constants of the brand itself, not of any one initiative, so every Project and Campaign under a Workspace draws on the same vault.

---

## 4. MVP1 Feature Scope

### 4.1 Authentication & Onboarding
- Supabase Auth: Magic Link + Google OAuth
- On first login: user creates or joins an Organisation
- Organisation creation flow: name → plan selection (flat rate, MVP1 only) → Workspace creation → invite members
- First-workspace onboarding continues into Brand Voice Vault setup and first Project creation (see §6)
- Workspace switcher in sidebar for Agency Admins

### 4.2 Brand Voice Vault
The RAG system that grounds every agent output in the client's actual brand context. Workspace-scoped — shared across all of a workspace's Projects and Campaigns.

**Ingestion sources:**
- PDF upload (brand guidelines, past campaigns, tone of voice docs, case studies)
- URL ingestion (website, blog, LinkedIn company page)
- Free-text entry (brand positioning statement, ICP description, key differentiators)
- **Google Drive** (NEW) — connect via OAuth once per workspace, then paste a share link or pick a file ID to ingest a Doc/PDF stored in Drive
- **Notion** (NEW) — connect via OAuth once per workspace, then paste a page URL to ingest that page's content

MVP1 ships a "connect once, then paste a link" flow for Drive/Notion — a full in-app file browser/picker is deferred (see §10).

**Processing pipeline:**
1. Extract raw text (PDF → pypdf / URL → Firecrawl / Drive → Drive export API / Notion → Notion blocks API)
2. Chunk into ~500-token segments with 50-token overlap
3. Embed each chunk via OpenAI `text-embedding-3-small`
4. Store vectors in `vault_documents`-linked chunk table (pgvector)
5. Tag each chunk with `source_type`, `source_url`/`external_file_id`, `workspace_id`

**Retrieval:** Cosine similarity search. Top-k results (k=8) injected into Architect Agent context on every run (and into ICP Agent context — see §4.5).

**UI:** Document library card view within the Workspace settings panel, plus "Connect Google Drive" / "Connect Notion" buttons and connection-status indicators. Shows ingestion status (queued / processing / ready / failed). User can delete documents and disconnect integrations.

**Security:** OAuth access/refresh tokens are encrypted at rest and are never selectable by an authenticated user's own JWT — the frontend reads connection status (provider, label, last synced) through a restricted view, never the token columns directly.

### 4.3 Projects & Campaigns (NEW)
A **Project** is the reusable knowledge container for an initiative (e.g. "Q3 EU Expansion", "New Product Launch — Enterprise Tier"). Research, ICP, and Market Sizing are generated at the Project level so they can be reused across every Campaign underneath it, instead of every campaign re-researching the same market from scratch.

A **Campaign** is an individual execution push under a Project (e.g. "LinkedIn ABM Push", "Q3 Paid Search Sprint"), with its own goal and channel selection. The Architect Agent runs at Campaign level, combining the Project's shared intelligence with the Campaign's specific goal/channels.

- Users create Projects and Campaigns through Vimi Chat (the only write surface — see §4.9)
- Deleting a Project or Campaign is a soft delete (archive) by default — the whole point of this layer is not losing institutional knowledge
- A Workspace can have many active Projects; a Project can have many active Campaigns
- Mission Control's navigation gains a Project selector and Campaign selector alongside the existing Workspace selector (§5)

### 4.4 Research Agent
*(renamed and broadened from v1.0's Intel Agent)*

Autonomous market and competitive research agent. Triggered manually by user at the Project level in MVP1 (scheduled triggers in a later phase).

**Input:**
- Competitor URLs (1–5 per run, entered by user)
- Industry keywords (free text)
- Open-ended research questions (free text, optional — NEW: lets the marketer steer research beyond pure competitor scraping, e.g. "what's driving budget consolidation in this category right now?")
- Workspace brand context (passed from Brand Voice Vault)

**Process (LangGraph graph):**
1. `scrape_node` — Firecrawl scrapes each competitor URL, returns raw markdown
2. `extract_node` — Claude Sonnet extracts structured data: key messaging, target audience, content themes, product positioning, CTAs; folds in any open-ended research questions
3. `synthesise_node` — Claude Sonnet compares across all competitors + identifies market gaps and intent triggers relative to the brand
4. `write_node` — Formats output as a structured Research Signal JSON object
5. `store_node` — Writes to `research_signals` table (scoped to `project_id`), updates `agent_runs` status

**Output (Research Signal JSON — schema unchanged from v1.0's Market Signal):**
```json
{
  "signal_id": "uuid",
  "workspace_id": "uuid",
  "project_id": "uuid",
  "generated_at": "ISO timestamp",
  "competitors_analysed": ["url1", "url2"],
  "competitor_profiles": [
    {
      "url": "string",
      "key_messaging": ["string"],
      "target_audience": "string",
      "content_themes": ["string"],
      "primary_cta": "string"
    }
  ],
  "market_gaps": ["string"],
  "intent_triggers": ["string"],
  "recommended_angles": ["string"],
  "sources": ["url"]
}
```

**Credit cost:** tracked (not gated) in MVP1.

### 4.5 ICP Agent (NEW)
Builds one or more Ideal Customer Profiles from the Project's Research Signal plus Brand Voice Vault context.

**Input:**
- A specific Research Signal, or the Project's latest one if unspecified
- Brand Voice Vault context (top-k RAG retrieval)

**Process (LangGraph graph):**
1. `retrieve_research_node` — loads the target Research Signal (hard-depends on Research Agent having run at least once for this Project)
2. `retrieve_vault_node` — top-k brand voice chunks via pgvector similarity search
3. `generate_node` — Claude Sonnet synthesises firmographics, buyer personas, pain points, and buying triggers
4. `store_node` — writes to `icp_profiles` table (scoped to `project_id`)

**Output (ICP Profile JSON):**
```json
{
  "profile_id": "uuid",
  "project_id": "uuid",
  "firmographics": {
    "company_size": "string",
    "industry": ["string"],
    "revenue_range": "string",
    "geography": ["string"]
  },
  "personas": [
    {
      "title": "string",
      "department": "string",
      "seniority": "string",
      "pain_points": ["string"],
      "buying_triggers": ["string"],
      "decision_role": "string"
    }
  ],
  "pain_points": ["string"],
  "buying_triggers": ["string"],
  "sources": ["url"]
}
```

**Credit cost:** tracked (not gated) in MVP1.

### 4.6 Market Sizing Agent (NEW)
Estimates TAM/SAM/SOM for the Project's target market, grounded in the Research Signal and any additional market-data sources the user supplies.

**Input:**
- A specific Research Signal, or the Project's latest one if unspecified
- Optional market-data URLs (0–5 — e.g. analyst reports, industry association pages)

**Process (LangGraph graph):**
1. `retrieve_research_node` — loads the target Research Signal
2. `scrape_node` — Firecrawl scrapes any supplied market-data URLs (skipped entirely if none supplied)
3. `estimate_node` — Claude Sonnet produces TAM/SAM/SOM estimates, each with an explicit methodology and stated assumptions — every number must be justified, not asserted
4. `store_node` — writes to `market_sizing_reports` table (scoped to `project_id`)

**Output (Market Sizing Report JSON):**
```json
{
  "report_id": "uuid",
  "project_id": "uuid",
  "tam_estimate": { "value": "string", "currency": "string", "methodology": "string", "assumptions": ["string"] },
  "sam_estimate": { "value": "string", "currency": "string", "methodology": "string", "assumptions": ["string"] },
  "som_estimate": { "value": "string", "currency": "string", "methodology": "string", "assumptions": ["string"] },
  "methodology_notes": "string",
  "sources": ["url"]
}
```

**Credit cost:** tracked (not gated) in MVP1.

### 4.7 Architect Agent
Campaign strategy agent. Runs at the **Campaign** level. Triggered after a Campaign is created (which in turn requires an active Project — Research required, ICP and Market Sizing optional but recommended).

**Input:**
- The Project's Research Signal (required)
- The Project's ICP Profile (optional — if absent, Architect proceeds without it and flags the gap in `risk_flags` rather than blocking)
- The Project's Market Sizing Report (optional — same graceful-degradation behaviour)
- Brand Voice Vault context (top-k RAG retrieval)
- The Campaign's goal (awareness / leads / pipeline / retention) and channels (LinkedIn, Google Search, Google Display, Meta, Email), set when the Campaign was created

**Process (LangGraph graph):**
1. `retrieve_project_intel_node` — fetches Research (required), ICP and Market Sizing (both optional) for the Campaign's Project
2. `retrieve_vault_node` — top-k brand voice chunks, query built from the combined project intelligence
3. `generate_node` — Claude Sonnet synthesises everything into a winning angle and full campaign playbook per channel
4. `validate_node` — self-review pass: checks for brand voice consistency, strategic coherence, citation completeness
5. `store_node` — writes to `campaign_playbooks` table (scoped to `campaign_id`, with FKs back to the Research/ICP/Market-Sizing sources actually used), updates `agent_runs` status

**Output (Campaign Playbook — schema unchanged from v1.0):** a structured JSON/markdown document containing an executive summary, messaging framework (primary message, proof points, CTA), per-channel plans (objective, content themes, KPIs), differentiation statement, and risk flags — every recommendation grounded in a cited source.

**Credit cost:** tracked (not gated) in MVP1.

### 4.8 Mission Control Canvas (Right Panel — 60%)
Real-time, read-only view of all agent activity. Updated via Supabase Realtime subscriptions. Navigation now includes Workspace, Project, and Campaign selectors, and tabs are grouped by scope:

**Workspace-level (always visible):** Overview, Vault (incl. Drive/Notion connection management)

**Project Intelligence (disabled until a Project is selected):**
- **Research Tab** — status badge, run history, expandable Research Signal (competitor profiles, market gaps, intent triggers, recommended angles), each cited
- **ICP Tab** (NEW) — status badge, expandable ICP profile(s): firmographics, personas, pain points, buying triggers
- **Market Sizing Tab** (NEW) — status badge, TAM/SAM/SOM cards with methodology and assumptions shown

**Campaign Execution (disabled until a Campaign is selected):**
- **Architect Tab** — status badge, current Campaign Playbook (rendered, channel-tabbed), approval gate ("Approve Playbook" — required before export), export options (PDF, Markdown, copy to clipboard), version history
- **Builder Tab** (LOCKED — Phase 2, unchanged)
- **Analyst Tab** (LOCKED — Phase 3, unchanged)

**Global elements:** Credit usage bar, Workspace/Project/Campaign selectors, last-updated timestamp per tab.

### 4.9 Vimi Chat Panel (Left Panel — 40%)
Conversational interface. The only surface for user input and intent — creation of Organisations, Workspaces, Projects, and Campaigns; Vault management (incl. Drive/Notion connect); every agent trigger; approvals. Mission Control never initiates writes.

Extended conversation flow — see §6 for the full phase table.

### 4.10 Credit Ledger (Track, Don't Gate — MVP1)
Every agent action writes a record to `credit_ledger`:

```
workspace_id, project_id?, campaign_id?, org_id, action_type, credits_consumed, agent_run_id, timestamp
```

`action_type` now covers `research_run`, `icp_run`, `market_sizing_run`, `architect_run`, `vault_ingest`.

**Dashboard display (Admin view):** total credits used this month per workspace, breakdown by action type, running total vs. monthly allocation, CSV export for client rebilling.

MVP1: No hard gating. A soft warning appears in Vimi Chat if usage exceeds the soft cap threshold (configurable per workspace by org admin).

---

## 5. UI Architecture

### Layout
```
┌─────────────────────────────────────────────────────────┐
│  Top Bar: Logo | Workspace / Project / Campaign | User    64px  │
├──────────────────────┬──────────────────────────────────┤
│                      │  [Overview] [Vault]                │
│   Vimi Chat Panel    │  ── Project Intelligence ──        │
│       40%            │  [Research] [ICP] [Market Sizing]  │
│                      │  ── Campaign Execution ──          │
│  [Chat history]      │  [Architect] [🔒Builder] [🔒Analyst]│
│                      │                                    │
│  [Input bar]         │  [Active tab content]              │
└──────────────────────┴──────────────────────────────────┘
```

Tabs are visually grouped into three sections — Workspace-level, Project Intelligence, Campaign Execution — with the latter two greyed and disabled (with a prompt to select/create a Project or Campaign) until the corresponding entity is selected.

### Design System (unchanged from v1.0 — extending V1 tokens)

| Token | Value |
|---|---|
| Background | `#0D1117` (dark — full app) |
| Surface | `#161B22` |
| Surface Elevated | `#1C2128` |
| Border | `#30363D` |
| Accent | `#2D7DD2` |
| Accent Glow | `rgba(45, 125, 210, 0.15)` |
| Success | `#3FB950` |
| Warning | `#D29922` |
| Error | `#F85149` |
| Locked | `#484F58` |
| Text Primary | `#E6EDF3` |
| Text Secondary | `#8B949E` |
| Text Muted | `#484F58` |

**Typography:** DM Sans (body + UI) + Geist Mono (code, JSON, keywords)

**Agent status colours:** Idle: Text Muted · Running: Accent with pulse animation · Complete: Success · Failed: Error

**Locked tab style:** unchanged — greyed label, lock icon, tooltip with phase label and waitlist CTA, frosted overlay with phase description.

### Realtime Updates
All Mission Control content subscribes to Supabase Realtime channels:
- `research_signals:workspace_id=eq.{id}` — Research tab
- `icp_profiles:workspace_id=eq.{id}` — ICP tab
- `market_sizing_reports:workspace_id=eq.{id}` — Market Sizing tab
- `campaign_playbooks:workspace_id=eq.{id}` — Architect tab
- `agent_runs:workspace_id=eq.{id}` — Status badges across all tabs (client-side filtered further by the currently selected `project_id`/`campaign_id` so switching between two Campaigns in the same Workspace doesn't cross-contaminate status badges)

No polling anywhere in the application.

---

## 6. Vimi Chat Conversation Flow

| Phase | Trigger | Vimi Action | User Action |
|---|---|---|---|
| `WELCOME` | First login | Introduce Vimi, explain the platform | — |
| `ORG_SETUP` | Auto | Ask for Organisation name + type (Agency / Brand) | Text input |
| `WORKSPACE_CREATE` | After org | Name the first Workspace (client brand name) | Text input |
| `VAULT_INTRO` | After workspace | Explain Brand Voice Vault, prompt first upload | — |
| `VAULT_UPLOAD` | After intro | Accept PDF upload, URL, text entry, or Drive/Notion connect + link | File / URL / Text / Drive / Notion |
| `VAULT_COMPLETE` | After ingestion | Confirm vault is ready, ask if they want to add more | Chips: Add more / Continue |
| `PROJECT_CREATE` | After vault | Name the first Project (the initiative this research will serve) | Text input |
| `RESEARCH_SETUP` | After project | Ask for competitor URLs, industry keywords, optional research questions | Text input |
| `RESEARCH_RUNNING` | After input | Confirm Research Agent is running, direct to Research tab | — |
| `ICP_SETUP` | After research completes | Offer to build an ICP from the research just gathered (skippable) | Chips: Build ICP / Skip |
| `ICP_RUNNING` | If accepted | Confirm ICP Agent is running, direct to ICP tab | — |
| `MARKET_SIZING_SETUP` | After ICP step | Offer market sizing, optional market-data URLs (skippable) | Chips / Text input |
| `MARKET_SIZING_RUNNING` | If accepted | Confirm Market Sizing Agent is running, direct to Market Sizing tab | — |
| `CAMPAIGN_CREATE` | After project intelligence phase | Ask for Campaign name, goal, and target channels | Text input / Chips |
| `ARCHITECT_SETUP` | Reachable any time a Campaign is selected | Confirm/adjust sources to use, trigger a (re-)run | — |
| `ARCHITECT_RUNNING` | After trigger | Confirm Architect Agent is running, direct to Architect tab | — |
| `ACTIVE` | After first Architect run | Persistent assistant — quick actions: new Campaign in this Project, run/re-run Research, ICP, or Market Sizing, switch or create a Project | Free-form chat |

ICP and Market Sizing both depend only on Research (not on each other) and are each individually skippable — a Project can go straight from Research to Campaign creation, with the Architect Agent degrading gracefully (see §4.7) and the Chat's `ACTIVE`-phase quick actions available to backfill either later.

---

## 7. Backend API Contracts

All routes: `Authorization: Bearer <supabase_jwt>` required except `/api/health` and the Drive/Notion OAuth callback routes (which the provider redirects the browser to directly).

### Organisation & Workspace
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/organisations` | Create organisation |
| GET | `/api/organisations/:id` | Get org + workspaces |
| POST | `/api/organisations/:id/workspaces` | Create workspace |
| GET | `/api/workspaces/:id` | Get workspace details |
| PATCH | `/api/workspaces/:id` | Update workspace settings |

### Projects & Campaigns
| Method | Endpoint | Purpose |
|---|---|---|
| GET / POST | `/api/workspaces/:id/projects` | List / create Projects |
| GET / PATCH / DELETE | `/api/workspaces/:id/projects/:projectId` | Get / update / archive a Project |
| GET / POST | `/api/workspaces/:id/projects/:projectId/campaigns` | List / create Campaigns |
| GET / PATCH / DELETE | `/api/workspaces/:id/projects/:projectId/campaigns/:campaignId` | Get / update / archive a Campaign |

### Brand Voice Vault & Integrations
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/workspaces/:id/vault/upload` | Upload PDF → triggers ingestion job |
| POST | `/api/workspaces/:id/vault/url` | Submit URL → triggers ingestion job |
| POST | `/api/workspaces/:id/vault/text` | Submit free text → direct ingestion |
| POST | `/api/workspaces/:id/vault/drive` | Ingest a Drive file (by file ID) → triggers ingestion job |
| POST | `/api/workspaces/:id/vault/notion` | Ingest a Notion page (by page URL/ID) → triggers ingestion job |
| GET | `/api/workspaces/:id/vault` | List all vault documents + status |
| DELETE | `/api/workspaces/:id/vault/:docId` | Remove document + its vectors |
| GET | `/api/workspaces/:id/integrations` | List connection status (Drive/Notion) |
| DELETE | `/api/workspaces/:id/integrations/:provider` | Disconnect an integration |
| GET | `/api/integrations/:provider/connect` | Begin OAuth connect flow |
| GET | `/api/integrations/:provider/callback` | OAuth callback (public) |

### Agent Triggers
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/workspaces/:id/projects/:projectId/agents/research/run` | Enqueue Research Agent job |
| POST | `/api/workspaces/:id/projects/:projectId/agents/icp/run` | Enqueue ICP Agent job |
| POST | `/api/workspaces/:id/projects/:projectId/agents/market-sizing/run` | Enqueue Market Sizing Agent job |
| POST | `/api/workspaces/:id/projects/:projectId/campaigns/:campaignId/agents/architect/run` | Enqueue Architect Agent job |
| GET | `/api/workspaces/:id/agent-runs` | List agent run history (workspace-wide) |
| GET | `/api/workspaces/:id/agent-runs/:runId` | Get single run status + output |

### Outputs
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/workspaces/:id/projects/:projectId/research-signals` | List Research Signals |
| GET | `/api/workspaces/:id/projects/:projectId/icp-profiles` | List ICP Profiles |
| GET | `/api/workspaces/:id/projects/:projectId/market-sizing-reports` | List Market Sizing Reports |
| GET | `/api/workspaces/:id/projects/:projectId/campaigns/:campaignId/playbooks` | List Campaign Playbooks |
| PATCH | `/api/workspaces/:id/projects/:projectId/campaigns/:campaignId/playbooks/:pbId/approve` | Mark playbook approved |
| GET | `/api/workspaces/:id/projects/:projectId/campaigns/:campaignId/playbooks/:pbId/export` | Export as PDF or Markdown |

### Credits & Admin
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/organisations/:id/credits` | Credit balance + usage breakdown |
| GET | `/api/workspaces/:id/credits` | Workspace-level usage |
| GET | `/api/admin/stats` | Platform stats (super_admin) |
| GET | `/api/admin/organisations` | All orgs (super_admin) |
| GET | `/api/admin/users` | All users (super_admin) |

---

## 8. Agent Service Architecture

### Redis Job Schema
```json
{
  "job_id": "uuid",
  "job_type": "research_run | icp_run | market_sizing_run | architect_run | vault_ingest",
  "workspace_id": "uuid",
  "org_id": "uuid",
  "payload": {},
  "created_at": "ISO timestamp",
  "priority": 1
}
```

### Research Agent — LangGraph Graph
```
START → scrape_node (Firecrawl, parallel per URL) → extract_node (Claude, per competitor + open research questions)
      → synthesise_node (Claude, cross-competitor) → write_node (Research Signal JSON) → store_node
END
```

### ICP Agent — LangGraph Graph
```
START → retrieve_research_node (load target/latest Research Signal for project)
      → retrieve_vault_node (pgvector top-8) → generate_node (Claude) → store_node
END
```

### Market Sizing Agent — LangGraph Graph
```
START → retrieve_research_node → scrape_node (Firecrawl on optional market-data URLs, skippable)
      → estimate_node (Claude, TAM/SAM/SOM with methodology + assumptions) → store_node
END
```

### Architect Agent — LangGraph Graph
```
START → retrieve_project_intel_node (Research required; ICP + Market Sizing optional)
      → retrieve_vault_node (pgvector top-8, query built from combined intel)
      → generate_node (Claude, winning angle + full playbook) → validate_node (self-review, re-runs generate once if score < threshold)
      → store_node
END
```

### Vault Ingestion — LangGraph Graph
```
START → extract_node (pypdf / Firecrawl / Drive export API / Notion blocks API, by source type)
      → chunk_node (500 tok, 50 overlap) → embed_node (OpenAI text-embedding-3-small, batched) → store_node
END
```

Error handling: any node failure updates `agent_runs.status = 'failed'` with `error_message`. Partial results are not stored.

**Integration token handling:** agent-service never holds OAuth client secrets. It calls a backend-internal endpoint (guarded by a shared internal API key, not user JWT) to obtain a valid, refreshed access token for a given `WorkspaceIntegration` at ingestion time.

---

## 9. Security Requirements

- RLS enabled on all tables. Policies enforce `workspace_id` match on every SELECT, INSERT, UPDATE, DELETE — including the new `projects`, `campaigns`, `research_signals`, `icp_profiles`, `market_sizing_reports` tables.
- Database triggers reject any INSERT/UPDATE where a row's denormalized `workspace_id` doesn't match its parent Project's or Campaign's actual workspace — the "every table carries workspace_id" convention is enforced in the database, not just trusted from application code.
- `SUPABASE_SERVICE_ROLE_KEY` used only in backend and agent-service. Never in frontend.
- Agent-service authenticates to Supabase using service role key — bypasses RLS intentionally, but all writes explicitly include `workspace_id` (and `project_id`/`campaign_id` where applicable).
- **Integration credentials:** OAuth access/refresh tokens for Google Drive/Notion connections are encrypted at rest and are never exposed through any policy reachable by a user's own JWT — the frontend only ever reads a restricted view exposing connection status, not token material. OAuth client secrets live only in the backend, which is the sole owner of the OAuth handshake and token refresh; agent-service requests a live token via an internal, non-user-facing endpoint.
- All file uploads scanned for type (PDF only in MVP1). Max file size: 20MB.
- Audit log: every agent run, every approval action, every export, every integration connect/disconnect recorded with `user_id` + timestamp.
- Human-in-the-loop gate: playbooks require explicit approval before export is enabled. No auto-publish in MVP1.

---

## 10. Out of Scope — MVP1

The following are explicitly deferred. Do not build or scaffold these in MVP1:

- Builder Agent (image, audio, video generation)
- Analyst Agent (ad platform connections, ROI attribution)
- Full in-app Google Drive / Notion file picker (MVP1 is connect-once-then-paste-a-link; a browsable picker is a candidate P2 addition)
- CRM integrations (HubSpot, Salesforce)
- LinkedIn / Google Ads push-to-draft
- Scheduled / autonomous agent runs (all runs are manually triggered in MVP1)
- Credit hard-gating (track only)
- Stripe billing integration (flat rate invoiced manually in MVP1)
- Mobile responsive layout (desktop-first, minimum 1280px viewport)
- New output formats beyond the existing structured Campaign Playbook (no separate AI-prompt-package or creative-handoff-brief artifact type this phase)

---

## 11. Success Criteria for MVP1

MVP1 is complete when a new user can:

1. Create an Organisation and Workspace
2. Upload brand documents to the Brand Voice Vault — including at least one document ingested via a connected Google Drive or Notion account — and see them processed
3. Create a Project and trigger the Research Agent with competitor URLs, seeing a Research Signal appear in Mission Control
4. Optionally trigger the ICP Agent and the Market Sizing Agent against that Research Signal, seeing their outputs appear in their respective tabs
5. Create a Campaign under that Project, trigger the Architect Agent, and receive a complete, cited Campaign Playbook that draws on all available Project intelligence plus the Brand Voice Vault
6. Approve the playbook and export it as PDF or Markdown
7. **Create a second Campaign under the same Project and confirm its Architect run reuses the existing Research/ICP/Market Sizing outputs without re-running them** — this is the concrete test of the "institutional knowledge reuse" goal that motivated the Project/Campaign hierarchy
8. An Agency Admin can see credit usage across all their workspaces, broken out by the five action types (research/icp/market-sizing/architect/vault-ingest)

---

## 12. Migration Notes (v1.0 → v2.0)

This PRD describes the target state; the existing codebase currently implements v1.0 (Intel + Architect only, flat under Workspace). Migrating live data requires:
- Enum value renames (`intel`→`research` on `AgentType`, `intel_run`→`research_run` on `CreditActionType`) applied via raw SQL, not `prisma db push`'s diff engine, to avoid unsafe type drop/recreate against production.
- A one-time backfill creating a "General" Project and a "Migrated Campaign" per existing Workspace that has agent output, so existing `market_signals`/`campaign_playbooks` rows have a valid `project_id`/`campaign_id` before those columns become required.
- Two pre-existing bugs to fix opportunistically while touching this code: `vault.ts`'s URL-ingestion route mislabels `source_type` as `pdf`; the shipped Architect output schema (`generate_node.py`) doesn't match what `shared/types/index.ts` documents — the code is ground truth, the shared type should be corrected to match.

Full engineering sequencing lives in `/root/.claude/plans/okay-so-what-we-re-unified-rabin.md`.
