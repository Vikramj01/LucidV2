# Lucid v2 — Product Framework

**Status:** Product north star. Supersedes the four-agent framing in `CLAUDE.md` and `docs/Lucid_v2_PRD_MVP1.md` for planning purposes. Those documents remain accurate as technical references for what has already shipped (MVP1: Intel + Architect agents) — they are not edited by this doc.

---

## Why this document exists

Lucid is being framed around three product pillars that mirror how a marketing manager actually works: research and define the market and strategy, decide the right channel and content for that strategy, then close the loop by measuring what happened. This document defines that framing, maps it against what's actually been built so far, and records the scope decisions that follow from it — so that the next phase of work (Measurement) can be planned against a clear picture instead of an assumed one.

**Key correction from investigation:** a review of the codebase and git history (7 shipped sprints, `fcdaade` → `774a532`) found MVP1 is substantially built already — full monorepo, a designed Supabase schema (`docs/Lucid_v2_schema.sql`), a working backend, and working Intel + Architect agents with a functional Vimi Chat Panel and Mission Control UI. The "no database" starting assumption for this planning exercise is true only in the narrow sense that the schema may not yet be applied to a live Supabase project — the schema itself is fully designed. See [Database Note](#database-note) below.

---

## The Three Pillars

### Pillar 1 — Strategy
Research and understand the market, define the market, define the Ideal Customer Profile(s).

### Pillar 2 — Channel & Content Selection
For the market and ICP defined in Pillar 1: select the right channel (social, paid digital, etc.), and the right type of content and medium for that channel.

### Handoff (gap — not a Lucid build target)
The point where the campaign passes out of Lucid: to the client's agency, to the client doing it themselves, or directly into a platform. Lucid does not produce or run the campaign assets itself — it hands off a complete, actionable package.

### Pillar 3 — Measurement
Connect the ad platforms, Google Analytics, and social platforms the campaign actually ran on; pull performance data back into Lucid; report on it. This closes the loop back to Pillar 1 (did the strategy work?).

---

## Pillar-by-Pillar: Current State

| Pillar | Maps to (existing/planned) | Status | Notes |
|---|---|---|---|
| **Strategy** | Intel Agent (market research) + Brand Voice Vault (RAG) + Architect Agent's strategy step (winning angle, target persona synthesis) | **Built** — Sprints 3–5 | Intel Agent scrapes competitors via Firecrawl and extracts structured signals; Architect Agent synthesizes those signals with brand context into a winning angle and target persona. |
| **Channel & Content Selection** | Architect Agent's playbook step — channel selection (LinkedIn / Google Search / Google Display / Meta / Email), per-channel `channel_plans`, messaging framework, content themes | **Built** — Sprint 5 | Functionally covers this pillar, but it's currently bundled into the single Architect Agent output rather than surfaced as its own distinct step in the UI. Not a build gap — a possible future UX refinement (see [Open Note](#open-note-splitting-strategy-from-channelcontent-in-the-ui)). |
| **Handoff** | Architect tab: "Approve Playbook" gate + Export (PDF / Markdown / copy to clipboard) | **Built** — Sprint 6, reused as-is | This already-shipped flow is confirmed sufficient to fulfill the handoff pillar. No new build required. |
| **Measurement** | Analyst Agent + ad platform connections | **Not built** — currently a locked "Phase 3" waitlist tab in Mission Control | The one real gap in the current build. See [Measurement Gap Analysis](#measurement-gap-analysis-phase-2-candidate-scope). |

---

## Scope Decision: Builder Agent Retired

The previous four-agent framing (`CLAUDE.md`, PRD) included a **Builder Agent** for in-house generation of images, video, and audio assets. Under this framework, that agent is **removed from the roadmap**.

Rationale: the user's pillar model treats content *production* as something that happens after the handoff (by the agency, the client, or the platform itself) — not as something Lucid does. Lucid's job stops at recommending the right channel and content type/medium (Pillar 2) and packaging that recommendation for handoff. Building an in-house asset generator would duplicate work the handoff already covers and isn't part of this framework.

**Not changed in this task:** the "Builder" locked tab in Mission Control (`frontend/components/mission-control/`) and its mentions in `CLAUDE.md` / the MVP1 PRD are left as-is — they're historical artifacts of the prior framing, not incorrect for the MVP1 scope they describe. This note exists so that whoever next touches Mission Control UI knows to repurpose or remove that tab rather than build it out into a real asset generator.

---

## Measurement Gap Analysis (Phase 2 candidate scope)

This is directional scope to plan against, not a committed sprint plan — a full PRD/sprint-plan pass (matching the rigor of `docs/Lucid_v2_PRD_MVP1.md` / `docs/SPRINT_PLAN_MVP1.md`) should be a separate follow-up once this framework is confirmed.

**New data:**
- `platform_connections` — `workspace_id`, `platform` (google_ads / ga4 / meta / linkedin_ads), OAuth credentials + status
- `performance_metrics` — `workspace_id`, `campaign_playbook_id`, `platform`, metric snapshots over time

**New Analyst Agent (LangGraph graph), mirroring the existing Intel/Architect graph pattern:**
```
START
  └── pull_node (per-platform API pull — Google Ads / GA4 / Meta / LinkedIn Ads)
        └── normalize_node (unify metrics across platforms into a common shape)
              └── store_node (write performance_metrics, update agent_runs)
                    └── report_node (Claude Sonnet — synthesize performance vs. the
                                      original campaign_playbook's stated goals,
                                      closing the loop back to Strategy)
END
```

**New backend routes:** connect/disconnect a platform (OAuth flow), trigger a pull job, fetch a performance summary for a workspace/playbook.

**UI:** replace the locked "Analyst" tab in Mission Control with a real reporting view once the above is built.

---

## Database Note

`docs/Lucid_v2_schema.sql` is fully designed for MVP1 (organisations, workspaces, vault, market_signals, campaign_playbooks, agent_runs, credit_ledger — with RLS and pgvector). Before any Phase 2 schema work (the two new Measurement tables above) begins, confirm whether this schema has actually been applied to a live Supabase project — that's a quick follow-up check, not part of this framework document.

---

## Open Note: splitting Strategy from Channel/Content in the UI

Right now, Strategy (Pillar 1) and Channel & Content Selection (Pillar 2) are both produced by a single Architect Agent run and shown together as one campaign playbook. The pillar model treats them as conceptually distinct steps. This is flagged here as a possible future UX/product refinement — e.g., showing the winning angle/ICP as its own reviewable output before channel/content recommendations are generated — but is explicitly **not** a build gap today; the underlying data (`playbook_content.messaging_framework` for strategy, `playbook_content.channel_plans` for channel/content) already separates the two conceptually within the existing playbook JSON.
