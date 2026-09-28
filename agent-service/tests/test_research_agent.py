"""
Unit tests for the Research Agent pipeline nodes, graph runner and job validation.

No network, no Supabase, no Firecrawl, no Anthropic API calls.
Run with: pytest tests/test_research_agent.py -v
"""
import sys
import types
import json
import asyncio
import pathlib
import importlib.util
from unittest.mock import MagicMock, patch

import pytest

# ── Stub top-level packages before any import ─────────────────────────────────

def _make_module(name: str) -> types.ModuleType:
    mod = types.ModuleType(name)
    sys.modules.setdefault(name, mod)
    return sys.modules[name]

for _name in ("app", "app.lib", "app.lib.settings", "app.lib.supabase", "app.lib.agent_run",
              "app.lib.credits", "app.lib.redis", "app.models", "app.nodes",
              "app.nodes.research", "app.graphs"):
    _make_module(_name)

# settings stub
_settings = MagicMock()
_settings.firecrawl_api_key = "fake-fc-key"
_settings.anthropic_api_key = "fake-anthropic-key"
sys.modules["app.lib.settings"].settings = _settings

# supabase stub
_supabase_mock = MagicMock()
sys.modules["app.lib.supabase"].get_supabase = lambda: _supabase_mock

# agent_run / credits / redis stubs
sys.modules["app.lib.agent_run"].mark_running = MagicMock()
sys.modules["app.lib.agent_run"].mark_complete = MagicMock()
sys.modules["app.lib.agent_run"].mark_failed = MagicMock()
sys.modules["app.lib.credits"].record_credit = MagicMock()
sys.modules["app.lib.redis"].get_redis = MagicMock()

# firecrawl stub
_firecrawl_mod = _make_module("firecrawl")

class _FakeFirecrawlApp:
    def __init__(self, api_key: str):
        pass
    def scrape_url(self, url: str, **kwargs):
        resp = MagicMock()
        resp.markdown = f"# Content for {url}\n\nSome competitor copy here."
        resp.metadata = {"title": f"Title {url}", "description": "desc"}
        return resp

_firecrawl_mod.FirecrawlApp = _FakeFirecrawlApp

# anthropic stub — tests patch Anthropic per case
_anthropic_mod = _make_module("anthropic")
if not hasattr(_anthropic_mod, "Anthropic"):
    _anthropic_mod.Anthropic = MagicMock()


# ── Load modules after stubs are in place ─────────────────────────────────────

ROOT = pathlib.Path(__file__).parent.parent

def _load(rel_path: str, module_name: str):
    spec = importlib.util.spec_from_file_location(module_name, ROOT / rel_path)
    mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    sys.modules[module_name] = mod
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod

llm_mod = _load("app/lib/llm.py", "app.lib.llm")
_load("app/models/outputs.py", "app.models.outputs")
jobs_mod = _load("app/models/jobs.py", "app.models.jobs")
scrape_mod = _load("app/nodes/research/scrape_node.py", "app.nodes.research.scrape_node")
extract_mod = _load("app/nodes/research/extract_node.py", "app.nodes.research.extract_node")
synth_mod = _load("app/nodes/research/synthesise_node.py", "app.nodes.research.synthesise_node")
write_mod = _load("app/nodes/research/write_node.py", "app.nodes.research.write_node")
store_mod = _load("app/nodes/research/store_node.py", "app.nodes.research.store_node")
graph_mod = _load("app/graphs/research_agent.py", "app.graphs.research_agent")
worker_mod = _load("app/lib/worker.py", "app.lib.worker")

scrape_node = scrape_mod.scrape_node
extract_node = extract_mod.extract_node
synthesise_node = synth_mod.synthesise_node
write_node = write_mod.write_node
store_node = store_mod.store_node

_mark_complete = sys.modules["app.lib.agent_run"].mark_complete
_mark_failed = sys.modules["app.lib.agent_run"].mark_failed
_record_credit = sys.modules["app.lib.credits"].record_credit


# ── Fixtures / helpers ────────────────────────────────────────────────────────

PROFILE = {
    "name": "Acme Corp",
    "positioning": "Leading B2B SaaS",
    "key_messaging": ["Fast", "Reliable"],
    "target_audience": "Mid-market ops teams",
    "content_themes": ["Automation", "ROI"],
    "primary_cta": "Book a demo",
    "weaknesses": ["No mobile app"],
    "research_notes": [],
}

SYNTHESIS = {
    "market_gaps": ["No AI assistant", "Poor onboarding"],
    "intent_triggers": ["Hiring ops staff", "Series B funding"],
    "recommended_angles": ["AI-first approach", "5-minute onboarding"],
    "research_findings": [],
}


def _claude_client(*response_texts: str):
    """Fake Anthropic client returning the given texts on successive calls."""
    client = MagicMock()
    messages = []
    for text in response_texts:
        block = MagicMock()
        block.text = text
        msg = MagicMock()
        msg.content = [block]
        messages.append(msg)
    client.messages.create.side_effect = messages
    return client


def _patch_claude(*response_texts: str):
    return patch.object(llm_mod.anthropic, "Anthropic", return_value=_claude_client(*response_texts))


def _reset_mocks():
    _supabase_mock.reset_mock()
    _supabase_mock.table.return_value.insert.return_value.execute.side_effect = None
    _supabase_mock.table.return_value.insert.return_value.execute.return_value.error = None
    for m in (_mark_complete, _mark_failed, _record_credit):
        m.reset_mock()


BASE_STATE = {
    "agent_run_id": "run-abc",
    "workspace_id": "ws-123",
    "org_id": "org-1",
    "project_id": "proj-1",
    "competitor_urls": ["https://acme.com", "https://rival.io"],
    "industry_keywords": "B2B SaaS marketing automation",
    "research_questions": [],
    "scrape_results": [],
    "competitor_profiles": [],
    "synthesis": {},
    "signal": {},
    "signal_id": "",
    "error": None,
}

SCRAPES = [
    {"url": "https://acme.com", "markdown": "Acme content", "title": "Acme", "description": ""},
    {"url": "https://rival.io", "markdown": "Rival content", "title": "Rival", "description": ""},
]


# ── llm helper ────────────────────────────────────────────────────────────────

def test_parse_json_response_strips_markdown_fences():
    assert llm_mod.parse_json_response(f"```json\n{json.dumps(PROFILE)}\n```") == PROFILE


def test_parse_json_response_rejects_non_object():
    with pytest.raises(ValueError):
        llm_mod.parse_json_response("[1, 2]")


# ── scrape_node ───────────────────────────────────────────────────────────────

def test_scrape_node_returns_results_in_url_order():
    result = asyncio.run(scrape_node({**BASE_STATE}))
    assert [r["url"] for r in result["scrape_results"]] == BASE_STATE["competitor_urls"]
    for r in result["scrape_results"]:
        assert {"url", "markdown", "title"} <= r.keys()


def test_scrape_node_all_urls_fail_returns_error():
    class _FailApp:
        def __init__(self, api_key): pass
        def scrape_url(self, url, **kwargs):
            raise RuntimeError("network error")

    with patch.object(scrape_mod, "FirecrawlApp", _FailApp):
        result = asyncio.run(scrape_node({**BASE_STATE}))
    assert result["error"]


def test_scrape_node_partial_failure_continues():
    class _PartialApp:
        def __init__(self, api_key): pass
        def scrape_url(self, url, **kwargs):
            if url == "https://acme.com":
                raise RuntimeError("first url fails")
            resp = MagicMock()
            resp.markdown = "content"
            resp.metadata = {"title": "T", "description": "D"}
            return resp

    with patch.object(scrape_mod, "FirecrawlApp", _PartialApp):
        result = asyncio.run(scrape_node({**BASE_STATE}))
    assert not result.get("error")
    assert [r["url"] for r in result["scrape_results"]] == ["https://rival.io"]


# ── extract_node ──────────────────────────────────────────────────────────────

def test_extract_node_returns_one_profile_per_competitor_with_url():
    state = {**BASE_STATE, "scrape_results": SCRAPES}
    with _patch_claude(json.dumps(PROFILE), json.dumps(PROFILE)):
        result = asyncio.run(extract_node(state))
    assert len(result["competitor_profiles"]) == 2
    assert {p["url"] for p in result["competitor_profiles"]} == {"https://acme.com", "https://rival.io"}


def test_extract_node_includes_research_questions_in_prompt():
    state = {**BASE_STATE, "scrape_results": SCRAPES[:1], "research_questions": ["Why now?"]}
    client = _claude_client(json.dumps(PROFILE))
    with patch.object(llm_mod.anthropic, "Anthropic", return_value=client):
        asyncio.run(extract_node(state))
    prompt = client.messages.create.call_args.kwargs["messages"][0]["content"]
    assert "Why now?" in prompt


def test_extract_node_drops_competitor_with_invalid_response():
    state = {**BASE_STATE, "scrape_results": SCRAPES}
    incomplete = {"name": "Rival"}
    with _patch_claude(json.dumps(PROFILE), json.dumps(incomplete)):
        result = asyncio.run(extract_node(state))
    assert not result.get("error")
    assert len(result["competitor_profiles"]) == 1


def test_extract_node_all_fail_returns_error():
    state = {**BASE_STATE, "scrape_results": SCRAPES}
    with _patch_claude("not json {{{", "also not json"):
        result = asyncio.run(extract_node(state))
    assert result["error"]


# ── synthesise_node ───────────────────────────────────────────────────────────

STATE_WITH_PROFILES = {
    **BASE_STATE,
    "competitor_profiles": [{**PROFILE, "url": "https://acme.com"}],
}


def test_synthesise_node_returns_synthesis():
    with _patch_claude(json.dumps(SYNTHESIS)):
        result = synthesise_node(STATE_WITH_PROFILES)
    assert result["synthesis"]["market_gaps"] == SYNTHESIS["market_gaps"]


def test_synthesise_node_validates_required_keys():
    with _patch_claude(json.dumps({"market_gaps": []})):
        result = synthesise_node(STATE_WITH_PROFILES)
    assert result["error"]


def test_synthesise_node_drops_findings_when_no_questions_asked():
    stray = {**SYNTHESIS, "research_findings": [{"question": "?", "answer": "!"}]}
    with _patch_claude(json.dumps(stray)):
        result = synthesise_node(STATE_WITH_PROFILES)
    assert result["synthesis"]["research_findings"] == []


def test_synthesise_node_keeps_findings_for_questions():
    findings = [{"question": "Why now?", "answer": "Budget cuts", "sources": ["https://acme.com"]}]
    with _patch_claude(json.dumps({**SYNTHESIS, "research_findings": findings})):
        result = synthesise_node({**STATE_WITH_PROFILES, "research_questions": ["Why now?"]})
    assert result["synthesis"]["research_findings"] == findings


# ── write_node ────────────────────────────────────────────────────────────────

def test_write_node_assembles_signal_with_deduplicated_sources():
    findings = [{"question": "Why now?", "answer": "A", "sources": ["https://acme.com", "https://report.io"]}]
    state = {
        **STATE_WITH_PROFILES,
        "research_questions": ["Why now?"],
        "synthesis": {**SYNTHESIS, "research_findings": findings},
    }
    signal = write_node(state)["signal"]
    assert signal["competitors_analysed"] == ["https://acme.com"]
    assert signal["sources"] == ["https://acme.com", "https://report.io"]
    assert signal["research_questions"] == ["Why now?"]
    assert signal["research_findings"][0]["answer"] == "A"
    assert signal["competitor_profiles"][0]["primary_cta"] == "Book a demo"


def test_write_node_rejects_invalid_profile():
    bad_profile = {"url": "https://acme.com", "name": "Acme"}  # missing required fields
    state = {**BASE_STATE, "competitor_profiles": [bad_profile], "synthesis": SYNTHESIS}
    assert write_node(state)["error"]


# ── store_node ────────────────────────────────────────────────────────────────

SIGNAL = {
    "competitors_analysed": ["https://acme.com"],
    "competitor_profiles": [{**PROFILE, "url": "https://acme.com"}],
    "market_gaps": SYNTHESIS["market_gaps"],
    "intent_triggers": SYNTHESIS["intent_triggers"],
    "recommended_angles": SYNTHESIS["recommended_angles"],
    "research_questions": [],
    "research_findings": [],
    "sources": ["https://acme.com"],
}


def test_store_node_inserts_project_scoped_row_and_records_credit():
    _reset_mocks()
    result = store_node({**BASE_STATE, "signal": SIGNAL})

    assert result["signal_id"]
    _supabase_mock.table.assert_any_call("research_signals")
    row = _supabase_mock.table.return_value.insert.call_args.args[0]
    assert row["workspace_id"] == "ws-123"
    assert row["project_id"] == "proj-1"
    assert row["agent_run_id"] == "run-abc"
    assert row["market_gaps"] == SIGNAL["market_gaps"]
    _record_credit.assert_called_once_with("run-abc", "ws-123", "org-1", "research_run")
    _mark_complete.assert_called_once_with("run-abc")
    _mark_failed.assert_not_called()


def test_store_node_marks_failed_on_db_error():
    _reset_mocks()
    _supabase_mock.table.return_value.insert.return_value.execute.side_effect = RuntimeError("DB down")

    result = store_node({**BASE_STATE, "signal": SIGNAL})

    assert result["error"]
    _mark_failed.assert_called_once()
    _mark_complete.assert_not_called()
    _record_credit.assert_not_called()


# ── run_research_agent ────────────────────────────────────────────────────────

JOB = {
    "job_id": "job-1",
    "job_type": "research_run",
    "workspace_id": "ws-123",
    "org_id": "org-1",
    "payload": {
        "agent_run_id": "run-abc",
        "project_id": "proj-1",
        "competitor_urls": ["https://acme.com"],
        "industry_keywords": "B2B SaaS",
        "research_questions": [],
    },
}


def test_run_research_agent_end_to_end():
    _reset_mocks()
    with _patch_claude(json.dumps(PROFILE), json.dumps(SYNTHESIS)):
        asyncio.run(graph_mod.run_research_agent(JOB))
    row = _supabase_mock.table.return_value.insert.call_args.args[0]
    assert row["project_id"] == "proj-1"
    assert row["competitors_analysed"] == ["https://acme.com"]
    _mark_complete.assert_called_once_with("run-abc")
    _mark_failed.assert_not_called()


def test_run_research_agent_marks_failed_when_early_node_fails():
    _reset_mocks()

    class _FailApp:
        def __init__(self, api_key): pass
        def scrape_url(self, url, **kwargs):
            raise RuntimeError("network error")

    with patch.object(scrape_mod, "FirecrawlApp", _FailApp):
        asyncio.run(graph_mod.run_research_agent(JOB))
    _mark_failed.assert_called_once()
    assert _mark_failed.call_args.args[0] == "run-abc"
    _mark_complete.assert_not_called()


# ── worker job validation ─────────────────────────────────────────────────────

def test_validate_job_fills_payload_defaults():
    job = {**JOB, "payload": {"agent_run_id": "r", "project_id": "p", "competitor_urls": ["https://a.com"]}}
    validated = worker_mod.validate_job(job)
    assert validated["payload"]["research_questions"] == []
    assert validated["payload"]["industry_keywords"] == ""


@pytest.mark.parametrize("job", [
    {**JOB, "job_type": "intel_run"},
    {**JOB, "payload": {**JOB["payload"], "project_id": None}},
    {**JOB, "payload": {**JOB["payload"], "competitor_urls": []}},
    {**JOB, "payload": {**JOB["payload"], "competitor_urls": [f"https://{i}.com" for i in range(6)]}},
])
def test_validate_job_rejects_malformed_jobs(job):
    with pytest.raises(worker_mod.ValidationError):
        worker_mod.validate_job(job)


def test_dispatch_marks_invalid_job_failed():
    _reset_mocks()
    bad = {**JOB, "payload": {"agent_run_id": "run-bad"}}
    with patch.object(worker_mod, "_try_mark_failure") as mark:
        asyncio.run(worker_mod.dispatch(bad))
    mark.assert_called_once()
    assert "Invalid job" in mark.call_args.args[1]
