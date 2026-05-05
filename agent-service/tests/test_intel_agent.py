"""
Unit tests for the Intel Agent pipeline nodes.

No network, no Supabase, no Firecrawl, no Anthropic API calls.
Run with: pytest tests/test_intel_agent.py -v
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

VALID_SIGNAL = {
    "competitor_profiles": [
        {
            "name": "Acme Corp",
            "url": "https://acme.com",
            "positioning": "Leading B2B SaaS",
            "key_messages": ["Fast", "Reliable"],
            "icp": "Mid-market ops teams",
            "weaknesses": ["No mobile app"],
        }
    ],
    "market_gaps": ["No AI assistant", "Poor onboarding"],
    "intent_triggers": ["Hiring ops staff", "Series B funding"],
    "recommended_angles": ["AI-first approach", "5-minute onboarding"],
}


def _make_anthropic_client(response_text: str = json.dumps(VALID_SIGNAL)):
    client = MagicMock()
    msg = MagicMock()
    content_block = MagicMock()
    content_block.text = response_text
    msg.content = [content_block]
    client.messages.create.return_value = msg
    return client

_anthropic_mod.Anthropic = lambda **kwargs: _make_anthropic_client()


# ── Load nodes after stubs are in place ───────────────────────────────────────

def _load(rel_path: str, module_name: str):
    spec = importlib.util.spec_from_file_location(
        module_name,
        pathlib.Path(__file__).parent.parent / rel_path,
    )
    mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod

scrape_mod = _load("app/nodes/intel/scrape_node.py", "scrape_node")
extract_mod = _load("app/nodes/intel/extract_node.py", "extract_node")
store_mod = _load("app/nodes/intel/store_node.py", "store_node")

scrape_node = scrape_mod.scrape_node
extract_node = extract_mod.extract_node
store_node = store_mod.store_node


# ── Helpers ───────────────────────────────────────────────────────────────────

BASE_STATE = {
    "agent_run_id": "run-abc",
    "workspace_id": "ws-123",
    "competitor_urls": ["https://acme.com", "https://rival.io"],
    "industry_keywords": "B2B SaaS marketing automation",
    "scrape_results": [],
    "signal_data": {},
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


def test_extract_node_returns_signal_data():
    client = _make_anthropic_client(json.dumps(VALID_SIGNAL))
    with patch.object(extract_mod.anthropic, "Anthropic", return_value=client):
        result = extract_node(STATE_WITH_SCRAPES)
    assert "signal_data" in result
    assert "competitor_profiles" in result["signal_data"]


def test_extract_node_validates_required_keys():
    incomplete = {"competitor_profiles": [], "market_gaps": []}
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
    wrapped = f"```json\n{json.dumps(VALID_SIGNAL)}\n```"
    client = _make_anthropic_client(wrapped)
    with patch.object(extract_mod.anthropic, "Anthropic", return_value=client):
        result = extract_node(STATE_WITH_SCRAPES)
    assert "signal_data" in result
    assert not result.get("error")


# ── store_node tests ──────────────────────────────────────────────────────────

STATE_WITH_SIGNAL = {
    **BASE_STATE,
    "scrape_results": [{"url": "https://acme.com", "markdown": "", "title": "", "description": ""}],
    "signal_data": VALID_SIGNAL,
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


def test_store_node_marks_failed_on_db_error():
    _supabase_mock.reset_mock()
    _mark_complete.reset_mock()
    _mark_failed.reset_mock()

    _supabase_mock.table.return_value.insert.return_value.execute.side_effect = RuntimeError("DB down")

    result = store_node(STATE_WITH_SIGNAL)

    assert "error" in result
    _mark_failed.assert_called_once()
    _mark_complete.assert_not_called()
