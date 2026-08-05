"""
Unit tests for the Research Agent pipeline nodes.
(renamed + extended from tests/test_intel_agent.py — Sprint 10)

No network, no Supabase, no Firecrawl, no Anthropic API calls.
Run with: pytest tests/test_research_agent.py -v
"""
import sys
import types
import json
import pathlib
import importlib.util
from unittest.mock import MagicMock, patch

import pytest

# ── Stub top-level packages before any import ─────────────────────────────────

def _make_module(name: str) -> types.ModuleType:
    mod = types.ModuleType(name)
    sys.modules.setdefault(name, mod)
    return sys.modules[name]

_make_module("app")
_make_module("app.lib")
_make_module("app.lib.settings")
_make_module("app.lib.supabase")
_make_module("app.lib.agent_run")

# settings stub
_settings = MagicMock()
_settings.firecrawl_api_key = "fake-fc-key"
_settings.anthropic_api_key = "fake-anthropic-key"
sys.modules["app.lib.settings"].settings = _settings

# supabase stub
_supabase_mock = MagicMock()
sys.modules["app.lib.supabase"].get_supabase = lambda: _supabase_mock

# agent_run stubs
sys.modules["app.lib.agent_run"].mark_running = MagicMock()
sys.modules["app.lib.agent_run"].mark_complete = MagicMock()
sys.modules["app.lib.agent_run"].mark_failed = MagicMock()

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

# anthropic stub
_anthropic_mod = _make_module("anthropic")

VALID_EXTRACT = {
    "competitor_profiles": [
        {
            "url": "https://acme.com",
            "key_messaging": ["Fast", "Reliable"],
            "target_audience": "Mid-market ops teams",
            "content_themes": ["automation", "efficiency"],
            "primary_cta": "Book a demo",
        }
    ],
}

VALID_SYNTHESIS = {
    "market_gaps": ["No AI assistant", "Poor onboarding"],
    "intent_triggers": ["Hiring ops staff", "Series B funding"],
    "recommended_angles": ["AI-first approach", "5-minute onboarding"],
}


def _make_anthropic_client(response_text: str):
    client = MagicMock()
    msg = MagicMock()
    content_block = MagicMock()
    content_block.text = response_text
    msg.content = [content_block]
    client.messages.create.return_value = msg
    return client

_anthropic_mod.Anthropic = lambda **kwargs: _make_anthropic_client(json.dumps(VALID_EXTRACT))


# ── Load nodes after stubs are in place ───────────────────────────────────────

def _load(rel_path: str, module_name: str):
    spec = importlib.util.spec_from_file_location(
        module_name,
        pathlib.Path(__file__).parent.parent / rel_path,
    )
    mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod

scrape_mod = _load("app/nodes/research/scrape_node.py", "research_scrape_node")
extract_mod = _load("app/nodes/research/extract_node.py", "research_extract_node")
synthesise_mod = _load("app/nodes/research/synthesise_node.py", "research_synthesise_node")
write_mod = _load("app/nodes/research/write_node.py", "research_write_node")
store_mod = _load("app/nodes/research/store_node.py", "research_store_node")

scrape_node = scrape_mod.scrape_node
extract_node = extract_mod.extract_node
synthesise_node = synthesise_mod.synthesise_node
write_node = write_mod.write_node
store_node = store_mod.store_node


# ── Helpers ───────────────────────────────────────────────────────────────────

BASE_STATE = {
    "agent_run_id": "run-abc",
    "workspace_id": "ws-123",
    "project_id": "proj-456",
    "competitor_urls": ["https://acme.com", "https://rival.io"],
    "industry_keywords": "B2B SaaS marketing automation",
    "research_questions": "",
    "scrape_results": [],
    "competitor_profiles": [],
    "synthesis_data": {},
    "research_signal": {},
    "signal_id": "",
    "error": None,
}


# ── scrape_node tests ─────────────────────────────────────────────────────────

def test_scrape_node_returns_results_for_each_url():
    result = scrape_node({**BASE_STATE})
    assert "scrape_results" in result
    assert len(result["scrape_results"]) == 2


def test_scrape_node_result_has_required_keys():
    result = scrape_node({**BASE_STATE})
    for r in result["scrape_results"]:
        assert "url" in r
        assert "markdown" in r
        assert "title" in r


def test_scrape_node_all_urls_fail_returns_error():
    class _FailApp:
        def __init__(self, api_key): pass
        def scrape_url(self, url, **kwargs):
            raise RuntimeError("network error")

    with patch.object(scrape_mod, "FirecrawlApp", _FailApp):
        result = scrape_node({**BASE_STATE})
    assert "error" in result
    assert result["error"]


def test_scrape_node_partial_failure_continues():
    call_count = {"n": 0}

    class _PartialApp:
        def __init__(self, api_key): pass
        def scrape_url(self, url, **kwargs):
            call_count["n"] += 1
            if call_count["n"] == 1:
                raise RuntimeError("first url fails")
            resp = MagicMock()
            resp.markdown = "content"
            resp.metadata = {"title": "T", "description": "D"}
            return resp

    with patch.object(scrape_mod, "FirecrawlApp", _PartialApp):
        result = scrape_node({**BASE_STATE})
    assert "error" not in result or not result["error"]
    assert len(result["scrape_results"]) == 1


# ── extract_node tests ────────────────────────────────────────────────────────

STATE_WITH_SCRAPES = {
    **BASE_STATE,
    "scrape_results": [
        {"url": "https://acme.com", "markdown": "Acme content", "title": "Acme", "description": ""},
    ],
}


def test_extract_node_returns_competitor_profiles():
    client = _make_anthropic_client(json.dumps(VALID_EXTRACT))
    with patch.object(extract_mod.anthropic, "Anthropic", return_value=client):
        result = extract_node(STATE_WITH_SCRAPES)
    assert "competitor_profiles" in result
    profile = result["competitor_profiles"][0]
    for key in ("url", "key_messaging", "target_audience", "content_themes", "primary_cta"):
        assert key in profile


def test_extract_node_folds_in_research_questions():
    client = _make_anthropic_client(json.dumps(VALID_EXTRACT))
    state = {**STATE_WITH_SCRAPES, "research_questions": "What's driving budget consolidation?"}
    with patch.object(extract_mod.anthropic, "Anthropic", return_value=client):
        result = extract_node(state)
    assert "competitor_profiles" in result
    user_content = client.messages.create.call_args.kwargs["messages"][0]["content"]
    assert "budget consolidation" in user_content


def test_extract_node_validates_required_keys():
    incomplete = {"competitor_profiles": [{"url": "https://acme.com"}]}  # missing most fields
    client = _make_anthropic_client(json.dumps(incomplete))
    with patch.object(extract_mod.anthropic, "Anthropic", return_value=client):
        result = extract_node(STATE_WITH_SCRAPES)
    assert "error" in result


def test_extract_node_handles_invalid_json():
    client = _make_anthropic_client("this is not json {{{")
    with patch.object(extract_mod.anthropic, "Anthropic", return_value=client):
        result = extract_node(STATE_WITH_SCRAPES)
    assert "error" in result


def test_extract_node_strips_markdown_fences():
    wrapped = f"```json\n{json.dumps(VALID_EXTRACT)}\n```"
    client = _make_anthropic_client(wrapped)
    with patch.object(extract_mod.anthropic, "Anthropic", return_value=client):
        result = extract_node(STATE_WITH_SCRAPES)
    assert "competitor_profiles" in result
    assert not result.get("error")


# ── synthesise_node tests ─────────────────────────────────────────────────────

STATE_WITH_PROFILES = {
    **BASE_STATE,
    "competitor_profiles": VALID_EXTRACT["competitor_profiles"],
}


def test_synthesise_node_returns_synthesis_data():
    client = _make_anthropic_client(json.dumps(VALID_SYNTHESIS))
    with patch.object(synthesise_mod.anthropic, "Anthropic", return_value=client):
        result = synthesise_node(STATE_WITH_PROFILES)
    assert "synthesis_data" in result
    for key in ("market_gaps", "intent_triggers", "recommended_angles"):
        assert key in result["synthesis_data"]


def test_synthesise_node_validates_required_keys():
    incomplete = {"market_gaps": []}
    client = _make_anthropic_client(json.dumps(incomplete))
    with patch.object(synthesise_mod.anthropic, "Anthropic", return_value=client):
        result = synthesise_node(STATE_WITH_PROFILES)
    assert "error" in result


def test_synthesise_node_handles_invalid_json():
    client = _make_anthropic_client("not json")
    with patch.object(synthesise_mod.anthropic, "Anthropic", return_value=client):
        result = synthesise_node(STATE_WITH_PROFILES)
    assert "error" in result


# ── write_node tests ──────────────────────────────────────────────────────────

STATE_WITH_SYNTHESIS = {
    **BASE_STATE,
    "scrape_results": [
        {"url": "https://acme.com", "markdown": "", "title": "", "description": ""},
        {"url": "https://rival.io", "markdown": "", "title": "", "description": ""},
    ],
    "competitor_profiles": VALID_EXTRACT["competitor_profiles"],
    "synthesis_data": VALID_SYNTHESIS,
}


def test_write_node_assembles_research_signal():
    result = write_node(STATE_WITH_SYNTHESIS)
    assert "research_signal" in result
    signal = result["research_signal"]
    assert signal["competitor_profiles"] == VALID_EXTRACT["competitor_profiles"]
    assert signal["market_gaps"] == VALID_SYNTHESIS["market_gaps"]
    assert signal["intent_triggers"] == VALID_SYNTHESIS["intent_triggers"]
    assert signal["recommended_angles"] == VALID_SYNTHESIS["recommended_angles"]
    assert signal["sources"] == ["https://acme.com", "https://rival.io"]
    assert signal["competitors_analysed"] == ["https://acme.com", "https://rival.io"]


# ── store_node tests ──────────────────────────────────────────────────────────

STATE_WITH_SIGNAL = {
    **BASE_STATE,
    "research_signal": {
        "competitors_analysed": ["https://acme.com"],
        "competitor_profiles": VALID_EXTRACT["competitor_profiles"],
        "market_gaps": VALID_SYNTHESIS["market_gaps"],
        "intent_triggers": VALID_SYNTHESIS["intent_triggers"],
        "recommended_angles": VALID_SYNTHESIS["recommended_angles"],
        "sources": ["https://acme.com"],
    },
}

_mark_complete = sys.modules["app.lib.agent_run"].mark_complete
_mark_failed = sys.modules["app.lib.agent_run"].mark_failed


def test_store_node_inserts_row_and_marks_complete():
    _supabase_mock.reset_mock()
    _mark_complete.reset_mock()
    _mark_failed.reset_mock()

    insert_result = MagicMock()
    insert_result.error = None
    _supabase_mock.table.return_value.insert.return_value.execute.return_value = insert_result

    result = store_node(STATE_WITH_SIGNAL)

    assert "signal_id" in result
    assert result["signal_id"]
    _mark_complete.assert_called_once_with("run-abc")
    _mark_failed.assert_not_called()


def test_store_node_includes_project_id():
    _supabase_mock.reset_mock()
    insert_result = MagicMock()
    insert_result.error = None
    _supabase_mock.table.return_value.insert.return_value.execute.return_value = insert_result

    store_node(STATE_WITH_SIGNAL)

    insert_call = _supabase_mock.table.return_value.insert.call_args
    row = insert_call[0][0]
    assert row["project_id"] == "proj-456"
    assert row["workspace_id"] == "ws-123"


def test_store_node_marks_failed_on_db_error():
    _supabase_mock.reset_mock()
    _mark_complete.reset_mock()
    _mark_failed.reset_mock()

    _supabase_mock.table.return_value.insert.return_value.execute.side_effect = RuntimeError("DB down")

    result = store_node(STATE_WITH_SIGNAL)

    assert "error" in result
    _mark_failed.assert_called_once()
    _mark_complete.assert_not_called()
