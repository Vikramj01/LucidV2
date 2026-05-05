# Lucid v2 — Product Requirements Document
## MVP1: The Strategic Brain

**Product:** Lucid v2  
**Company:** ViMi Digital  
**Version:** 1.0  
**Scope:** MVP1 only — Intel Agent + Architect Agent + Brand Voice Vault + Mission Control UI  

---

## 1. Product Overview

Lucid v2 is an agentic B2B marketing engine. It operates through four specialised AI agents that run autonomously per client workspace: the Intel Agent (market research), the Architect Agent (campaign strategy), the Builder Agent (multimedia production), and the Analyst Agent (performance optimisation).

MVP1 ships the Intel and Architect agents only. The platform is multi-tenant, built for marketing agencies managing multiple client brands, and for individual B2B companies managing their own brand.

**The core value proposition of MVP1:** A user uploads their brand documents and competitor URLs. Lucid autonomously researches the competitive landscape, synthesises market signals with brand context, and produces a structured, cited multi-channel campaign strategy — without a human strategist doing the work.

---

## 2. User Personas

### Agency Admin
- Manages the Organisation account and billing
- Creates and oversees multiple client Workspaces
- Reviews credit consumption across all workspaces
- Has full read/write access to all workspaces

### Workspace Member (Client User)
- Works within a single assigned Workspace
- Configures Brand Voice Vault, triggers agents, reviews outputs
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
      ├── brand_voice_vault[] (RAG documents)
      ├── market_signals[] (Intel Agent outputs)
      ├── campaign_playbooks[] (Architect Agent outputs)
      ├── agent_runs[] (status log for Mission Control)
      ├── credit_ledger[] (per-action usage log)
      └── Users[] (members of this workspace)
```

Every database table includes `workspace_id`. All Supabase queries enforce Row-Level Security — no cross-workspace data access under any circumstance.

---

## 4. MVP1 Feature Scope

### 4.1 Authentication & Onboarding
- Supabase Auth: Magic Link + Google OAuth
- On first login: user creates or joins an Organisation
- Organisation creation flow: name → plan selection (flat rate, MVP1 only) → Workspace creation → invite members
- Workspace switcher in sidebar for Agency Admins

### 4.2 Brand Voice Vault
The RAG system that grounds every agent output in the client's actual brand context.

**Ingestion sources:**
- PDF upload (brand guidelines, past campaigns, tone of voice docs, case studies)
- URL ingestion (website, blog, LinkedIn company page)
- Free-text entry (brand positioning statement, ICP description, key differentiators)

**Processing pipeline:**
1. Extract raw text (PDF → pypdf / URL → Firecrawl)
2. Chunk into ~500-token segments with 50-token overlap
3. Embed each chunk via OpenAI `text-embedding-3-small`
4. Store vectors in `brand_voice_documents` table (pgvector)
5. Tag each chunk with `source_type`, `source_url`, `workspace_id`

**Retrieval:** Cosine similarity search. Top-k results (k=8) injected into Architect Agent context on every run.

**UI:** Document library card view within the Workspace settings panel. Shows ingestion status (queued / processing / ready / failed). User can delete documents.

### 4.3 Intel Agent
Autonomous competitive research agent. Triggered manually by user in MVP1 (scheduled triggers in Phase 2).

**Input:**
- Competitor URLs (1–5 per run, entered by user)
- Industry keywords (free text)
- Workspace brand context (passed from Brand Voice Vault)

**Process (LangGraph graph):**
1. `scrape_node` — Firecrawl scrapes each competitor URL, returns raw markdown
2. `extract_node` — Claude Sonnet extracts structured data: key messaging, target audience, content themes, product positioning, CTAs
3. `synthesise_node` — Claude Sonnet compares across all competitors + identifies market gaps and intent triggers relative to the brand
4. `write_node` — Formats output as a structured Market Signal JSON object
5. `store_node` — Writes to `market_signals` table, updates `agent_runs` status

**Output (Market Signal JSON):**
```json
{
  "signal_id": "uuid",
  "workspace_id": "uuid",
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

**Credit cost:** 3 credits per Intel Agent run (tracked, not gated in MVP1).

### 4.4 Architect Agent
Campaign strategy agent. Triggered after Intel Agent completes or manually if Market Signals already exist.

**Input:**
- Latest Market Signal (from `market_signals` table)
- Brand Voice Vault context (top-k RAG retrieval)
- User-specified campaign goal (awareness / leads / pipeline / retention — selected in Vimi Chat)
- Target channels (user selects from: LinkedIn, Google Search, Google Display, Meta, Email)

**Process (LangGraph graph):**
1. `retrieve_node` — Fetches top-k brand voice chunks via pgvector similarity search
2. `strategy_node` — Claude Sonnet synthesises market signals + brand context → winning angle and channel prioritisation
3. `playbook_node` — Claude Sonnet produces full campaign playbook per selected channel
4. `validate_node` — Self-review pass: checks for brand voice consistency, strategic coherence, citation completeness
5. `store_node` — Writes to `campaign_playbooks` table, updates `agent_runs` status

**Output (Campaign Playbook):**
A structured markdown document per channel containing:
- Winning angle statement (1–2 sentences)
- Target persona (derived from brand vault + market signals)
- Channel strategy rationale (cited from market signals)
- Campaign structure (phases, budget allocation %)
- Messaging framework (hero message, supporting points, proof points)
- Ad copy variants (3 per format)
- Recommended keywords (Google only)
- Success metrics and KPI targets
- Every recommendation cites its source (competitor insight or brand document)

**Credit cost:** 5 credits per Architect Agent run (tracked, not gated in MVP1).

### 4.5 Mission Control Canvas (Right Panel — 60%)
Real-time view of all agent activity. Read-only. Updated via Supabase Realtime subscriptions.

**Four tabs — always visible:**

#### Intel Tab (LIVE — MVP1)
- Agent status badge: Idle / Running / Complete / Failed
- Run history: last 5 runs with timestamps
- Active market signal: expandable sections for competitor profiles, market gaps, intent triggers, recommended angles
- "Run Intel Agent" button — opens input drawer in Vimi Chat
- Each data point shows its source URL (cited)

#### Architect Tab (LIVE — MVP1)
- Agent status badge
- Current campaign playbook: rendered markdown, channel-tabbed
- Approval gate: "Approve Playbook" button — required before export
- Export options: PDF, Markdown, copy to clipboard
- Version history: previous playbooks listed by date

#### Builder Tab (LOCKED — Phase 2)
- Locked overlay with label: "Phase 2 — Visual Studio"
- Preview description: "Image, audio, and video assets generated from your approved playbook"
- "Join waitlist" CTA (email capture)

#### Analyst Tab (LOCKED — Phase 3)
- Locked overlay with label: "Phase 3 — Performance Loop"
- Preview description: "Live ROI attribution and optimisation signals from your active campaigns"
- "Join waitlist" CTA

**Global elements (Mission Control):**
- Credit usage bar: current balance / monthly allocation
- Workspace selector dropdown (Agency Admins only)
- Last updated timestamp per tab

### 4.6 Vimi Chat Panel (Left Panel — 40%)
Conversational interface. The only surface for user input and intent.

**What happens here:**
- Workspace setup and configuration
- Brand Voice Vault document upload and management
- Agent trigger inputs (competitor URLs, campaign goal, channel selection)
- Approval confirmations (Vimi presents a summary before writing to DB)
- Output explanations (user can ask Vimi to explain any part of the playbook)

**What does NOT happen here:**
- Displaying raw agent outputs (those live in Mission Control)
- Any direct agent output rendering

**Vimi persona behaviour:**
- Always refer to itself as Vimi
- Guides users through setup in a structured but conversational way
- When an agent runs, Vimi provides a plain-English status update in chat ("I've sent the Intel Agent to research your three competitors — you'll see the signals appear in the Intel tab shortly.")
- When output is ready, Vimi summarises the key findings in 3–4 sentences and directs user to Mission Control for full detail

**Chat state:** 10-phase conversation flow (see Section 6).

### 4.7 Credit Ledger (Track, Don't Gate — MVP1)
Every agent action writes a record to `credit_ledger`:

```
workspace_id, org_id, action_type, credits_consumed, agent_run_id, timestamp
```

**Dashboard display (Admin view):**
- Total credits used this month per workspace
- Breakdown by action type
- Running total vs. monthly allocation
- CSV export for client rebilling

MVP1: No hard gating. A soft warning appears in Vimi Chat if usage exceeds the soft cap threshold (configurable per workspace by org admin).

---

## 5. UI Architecture

### Layout
```
┌─────────────────────────────────────────────────────────┐
│  Top Bar: Logo | Workspace Name | User Menu        64px  │
├──────────────────────┬──────────────────────────────────┤
│                      │                                   │
│   Vimi Chat Panel    │    Mission Control Canvas         │
│       40%            │           60%                     │
│                      │                                   │
│  [Chat history]      │  [Intel] [Architect] [🔒Builder]  │
│                      │  [🔒Analyst]                      │
│  [Input bar]         │                                   │
│                      │  [Active tab content]             │
└──────────────────────┴──────────────────────────────────┘
```

### Design System (extending V1 tokens)

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

**Agent status colours:**
- Idle: Text Muted
- Running: Accent with pulse animation
- Complete: Success
- Failed: Error

**Locked tab style:** Tab label greyed to Locked colour, lock icon prefix, click opens a tooltip with phase label and waitlist CTA. Tab content area shows frosted overlay with phase description.

### Realtime Updates
All Mission Control content subscribes to Supabase Realtime channels:
- `market_signals:workspace_id=eq.{id}` — Intel tab
- `campaign_playbooks:workspace_id=eq.{id}` — Architect tab
- `agent_runs:workspace_id=eq.{id}` — Status badges across all tabs

No polling anywhere in the application.

---

## 6. Vimi Chat Conversation Flow (10 Phases)

| Phase | Trigger | Vimi Action | User Action |
|---|---|---|---|
| `WELCOME` | First login | Introduce Vimi, explain the platform | — |
| `ORG_SETUP` | Auto | Ask for Organisation name + type (Agency / Brand) | Text input |
| `WORKSPACE_CREATE` | After org | Name the first Workspace (client brand name) | Text input |
| `VAULT_INTRO` | After workspace | Explain Brand Voice Vault, prompt first upload | — |
| `VAULT_UPLOAD` | After intro | Accept PDF upload or URL or text entry, confirm ingestion | File / URL / Text |
| `VAULT_COMPLETE` | After ingestion | Confirm vault is ready, ask if they want to add more | Chips: Add more / Continue |
| `INTEL_SETUP` | After vault | Ask for competitor URLs (up to 5) + industry keywords | Text input |
| `INTEL_RUNNING` | After input | Confirm Intel Agent is running, direct to Intel tab | — |
| `ARCHITECT_SETUP` | After Intel complete | Ask for campaign goal + target channels | Chips |
| `ARCHITECT_RUNNING` | After input | Confirm Architect Agent is running, direct to Architect tab | — |

After `ARCHITECT_RUNNING`, the user is in "active workspace" mode — Vimi becomes a persistent assistant for questions, re-runs, and configuration changes.

---

## 7. Backend API Contracts

All routes: `Authorization: Bearer <supabase_jwt>` required except `/api/health`.

### Organisation & Workspace
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/organisations` | Create organisation |
| GET | `/api/organisations/:id` | Get org + workspaces |
| POST | `/api/organisations/:id/workspaces` | Create workspace |
| GET | `/api/workspaces/:id` | Get workspace details |
| PATCH | `/api/workspaces/:id` | Update workspace settings |

### Brand Voice Vault
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/workspaces/:id/vault/upload` | Upload PDF → triggers ingestion job |
| POST | `/api/workspaces/:id/vault/url` | Submit URL → triggers ingestion job |
| POST | `/api/workspaces/:id/vault/text` | Submit free text → direct ingestion |
| GET | `/api/workspaces/:id/vault` | List all vault documents + status |
| DELETE | `/api/workspaces/:id/vault/:docId` | Remove document + its vectors |

### Agent Triggers
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/workspaces/:id/agents/intel/run` | Enqueue Intel Agent job |
| POST | `/api/workspaces/:id/agents/architect/run` | Enqueue Architect Agent job |
| GET | `/api/workspaces/:id/agent-runs` | List agent run history |
| GET | `/api/workspaces/:id/agent-runs/:runId` | Get single run status + output |

### Outputs
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/workspaces/:id/market-signals` | List market signals |
| GET | `/api/workspaces/:id/market-signals/:sigId` | Get single signal |
| GET | `/api/workspaces/:id/playbooks` | List campaign playbooks |
| GET | `/api/workspaces/:id/playbooks/:pbId` | Get single playbook |
| PATCH | `/api/workspaces/:id/playbooks/:pbId/approve` | Mark playbook approved |
| GET | `/api/workspaces/:id/playbooks/:pbId/export` | Export as PDF or Markdown |

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
  "job_type": "intel_run | architect_run | vault_ingest",
  "workspace_id": "uuid",
  "org_id": "uuid",
  "payload": {},
  "created_at": "ISO timestamp",
  "priority": 1
}
```

### Intel Agent — LangGraph Graph
```
START
  └── scrape_node (Firecrawl — parallel per URL)
        └── extract_node (Claude Sonnet — per competitor)
              └── synthesise_node (Claude Sonnet — cross-competitor)
                    └── write_node (format Market Signal JSON)
                          └── store_node (Supabase write + agent_run update)
END
```

Error handling: Any node failure updates `agent_runs.status = 'failed'` with `error_message`. Partial results are not stored.

### Architect Agent — LangGraph Graph
```
START
  └── retrieve_node (pgvector similarity search — top 8 chunks)
        └── strategy_node (Claude Sonnet — winning angle + channel plan)
              └── playbook_node (Claude Sonnet — full playbook per channel)
                    └── validate_node (Claude Sonnet — self-review pass)
                          └── store_node (Supabase write + agent_run update)
END
```

Validate node uses a structured checklist prompt: brand voice consistency (3 checks), strategic coherence (3 checks), citation completeness (every recommendation must have a source). If validation score < threshold, playbook_node re-runs once with critique injected.

### Vault Ingestion — LangGraph Graph
```
START
  └── extract_node (pypdf / Firecrawl depending on source type)
        └── chunk_node (500-token chunks, 50-token overlap)
              └── embed_node (OpenAI text-embedding-3-small — batched)
                    └── store_node (pgvector upsert + document status update)
END
```

---

## 9. Security Requirements

- RLS enabled on all tables. Policies enforce `workspace_id` match on every SELECT, INSERT, UPDATE, DELETE.
- `SUPABASE_SERVICE_ROLE_KEY` used only in backend and agent-service. Never in frontend.
- Agent-service authenticates to Supabase using service role key — bypasses RLS intentionally, but all writes explicitly include `workspace_id`.
- All file uploads scanned for type (PDF only in MVP1). Max file size: 20MB.
- Audit log: every agent run, every approval action, every export recorded with `user_id` + timestamp.
- Human-in-the-loop gate: playbooks require explicit approval before export is enabled. No auto-publish in MVP1.

---

## 10. Out of Scope — MVP1

The following are explicitly deferred. Do not build or scaffold these in MVP1:

- Builder Agent (image, audio, video generation)
- Analyst Agent (ad platform connections, ROI attribution)
- CRM integrations (HubSpot, Salesforce)
- LinkedIn / Google Ads push-to-draft
- Scheduled / autonomous agent runs (all runs are manually triggered in MVP1)
- Credit hard-gating (track only)
- Stripe billing integration (flat rate invoiced manually in MVP1)
- Mobile responsive layout (desktop-first, minimum 1280px viewport)

---

## 11. Success Criteria for MVP1

MVP1 is complete when a new user can:

1. Create an Organisation and Workspace
2. Upload brand documents to the Brand Voice Vault and see them processed
3. Trigger the Intel Agent with competitor URLs and see Market Signals appear in Mission Control
4. Trigger the Architect Agent and receive a complete, cited Campaign Playbook
5. Approve the playbook and export it as PDF or Markdown
6. An Agency Admin can see credit usage across all their workspaces
