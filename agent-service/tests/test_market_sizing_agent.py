"""
Unit tests for the Market Sizing Agent pipeline nodes.

No network, no Supabase, no Firecrawl, no Anthropic API calls.
Run with: pytest tests/test_market_sizing_agent.py -v
"""
import sys
import types
import json
import pathlib
import importlib.util
from unittest.mock import MagicMock, patch

import pytest

# ── Stub top-level packages ───────────────────────────────────────────────────

def _make_module(name: str) -> types.ModuleType:
    mod = types.ModuleType(name)
    sys.modules.setdefault(name, mod)
    return sys.modules[name]

_make_module("app")
_make_module("app.lib")
_make_module("app.lib.settings")
_make_module("app.lib.supabase")
_make_module("app.lib.agent_run")

_settings = MagicMock()
_settings.firecrawl_api_key = "fake-fc-key"
_settings.anthropic_api_key = "fake-anthropic-key"
sys.modules["app.lib.settings"].settings = _settings

_supabase_mock = MagicMock()
sys.modules["app.lib.supabase"].get_supabase = lambda: _supabase_mock

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
        resp.markdown = f"# Market data for {url}"
        resp.metadata = {"title": f"Title {url}"}
        return resp

_firecrawl_mod.FirecrawlApp = _FakeFirecrawlApp

# anthropic stub
_anthropic_mod = _make_module("anthropic")

VALID_SIZING = {
    "tam_estimate": {
        "value": "$4.2B", "currency": "USD",
        "methodology": "Top-down from industry report",
        "assumptions": ["5% YoY growth"],
    },
    "sam_estimate": {
        "value": "$800M", "currency": "USD",
        "methodology": "Filtered to North America mid-market",
        "assumptions": ["Geography: NA only"],
    },
    "som_estimate": {
        "value": "$40M", "currency": "USD",
        "methodology": "5% realistic capture rate of SAM",
        "assumptions": ["3-year horizon"],
    },
    "methodology_notes": "Estimates derived from research signal and one market report.",
    "sources": ["research_signal:rs-001"],
}


def _make_anthropic_client(text: str = json.dumps(VALID_SIZING)):
    client = MagicMock()
    msg = MagicMock()
    block = MagicMock()
    block.text = text
    msg.content = [block]
    client.messages.create.return_value = msg
    return client

_anthropic_mod.Anthropic = lambda **kwargs: _make_anthropic_client()


# ── Load nodes ────────────────────────────────────────────────────────────────

def _load(rel_path: str, module_name: str):
    spec = importlib.util.spec_from_file_location(
        module_name,
        pathlib.Path(__file__).parent.parent / rel_path,
    )
    mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod

retrieve_research_mod = _load("app/nodes/market_sizing/retrieve_research_node.py", "ms_retrieve_research_node")
scrape_mod = _load("app/nodes/market_sizing/scrape_node.py", "ms_scrape_node")
estimate_mod = _load("app/nodes/market_sizing/estimate_node.py", "ms_estimate_node")
store_mod = _load("app/nodes/market_sizing/store_node.py", "ms_store_node")

retrieve_research_node = retrieve_research_mod.retrieve_research_node
scrape_node = scrape_mod.scrape_node
estimate_node = estimate_mod.estimate_node
store_node = store_mod.store_node


# ── Fixtures ──────────────────────────────────────────────────────────────────

RESEARCH_SIGNAL = {
    "id": "rs-001",
    "market_gaps": ["No AI assistant"],
    "recommended_angles": ["AI-first approach"],
    "intent_triggers": ["Hiring ops staff"],
    "competitor_profiles": [],
}

BASE_STATE = {
    "agent_run_id": "run-ms-1",
    "workspace_id": "ws-456",
    "project_id": "proj-789",
    "research_signal_id": None,
    "market_data_urls": [],
    "research_signal": RESEARCH_SIGNAL,
    "scraped_sources": [],
    "sizing_data": {},
    "report_id": "",
    "error": None,
}

_mark_complete = sys.modules["app.lib.agent_run"].mark_complete
_mark_failed = sys.modules["app.lib.agent_run"].mark_failed


# ── retrieve_research_node tests ──────────────────────────────────────────────

def test_retrieve_research_node_falls_back_to_latest():
    _supabase_mock.reset_mock()
    row_result = MagicMock()
    row_result.data = [RESEARCH_SIGNAL]
    chain = _supabase_mock.table.return_value.select.return_value.eq.return_value
    chain.order.return_value.limit.return_value.execute.return_value = row_result

    result = retrieve_research_node({**BASE_STATE})

    assert result["research_signal"]["id"] == "rs-001"


def test_retrieve_research_node_errors_when_none_found():
    _supabase_mock.reset_mock()
    row_result = MagicMock()
    row_result.data = []
    chain = _supabase_mock.table.return_value.select.return_value.eq.return_value
    chain.order.return_value.limit.return_value.execute.return_value = row_result

    result = retrieve_research_node({**BASE_STATE})

    assert "error" in result


# ── scrape_node tests ─────────────────────────────────────────────────────────

def test_scrape_node_returns_empty_when_no_urls():
    result = scrape_node({**BASE_STATE, "market_data_urls": []})
    assert result["scraped_sources"] == []


def test_scrape_node_scrapes_supplied_urls():
    result = scrape_node({**BASE_STATE, "market_data_urls": ["https://analyst-report.example.com"]})
    assert len(result["scraped_sources"]) == 1
    assert result["scraped_sources"][0]["url"] == "https://analyst-report.example.com"


def test_scrape_node_continues_on_partial_failure():
    class _PartialApp:
        def __init__(self, api_key): pass
        def scrape_url(self, url, **kwargs):
            raise RuntimeError("blocked")

    with patch.object(scrape_mod, "FirecrawlApp", _PartialApp):
        result = scrape_node({**BASE_STATE, "market_data_urls": ["https://blocked.example.com"]})
    assert result["scraped_sources"] == []
    assert "error" not in result


# ── estimate_node tests ───────────────────────────────────────────────────────

def test_estimate_node_returns_sizing_data():
    client = _make_anthropic_client(json.dumps(VALID_SIZING))
    with patch.object(estimate_mod.anthropic, "Anthropic", return_value=client):
        result = estimate_node(BASE_STATE)
    assert "sizing_data" in result
    assert "tam_estimate" in result["sizing_data"]
    assert "sam_estimate" in result["sizing_data"]
    assert "som_estimate" in result["sizing_data"]


def test_estimate_node_validates_required_keys():
    incomplete = {"tam_estimate": {}}
    client = _make_anthropic_client(json.dumps(incomplete))
    with patch.object(estimate_mod.anthropic, "Anthropic", return_value=client):
        result = estimate_node(BASE_STATE)
    assert "error" in result


def test_estimate_node_handles_invalid_json():
    client = _make_anthropic_client("not json")
    with patch.object(estimate_mod.anthropic, "Anthropic", return_value=client):
        result = estimate_node(BASE_STATE)
    assert "error" in result


def test_estimate_node_works_with_no_scraped_sources():
    client = _make_anthropic_client(json.dumps(VALID_SIZING))
    with patch.object(estimate_mod.anthropic, "Anthropic", return_value=client):
        result = estimate_node({**BASE_STATE, "scraped_sources": []})
    assert "sizing_data" in result


# ── store_node tests ──────────────────────────────────────────────────────────

STATE_WITH_SIZING = {
    **BASE_STATE,
    "research_signal_id": "rs-001",
    "sizing_data": VALID_SIZING,
}


def test_store_node_inserts_row_and_marks_complete():
    _supabase_mock.reset_mock()
    _mark_complete.reset_mock()
    _mark_failed.reset_mock()

    insert_result = MagicMock()
    insert_result.error = None
    _supabase_mock.table.return_value.insert.return_value.execute.return_value = insert_result

    result = store_node(STATE_WITH_SIZING)

    assert "report_id" in result
    assert result["report_id"]
    _mark_complete.assert_called_once_with("run-ms-1")
    _mark_failed.assert_not_called()


def test_store_node_writes_to_market_sizing_reports_table():
    _supabase_mock.reset_mock()
    insert_result = MagicMock()
    insert_result.error = None
    _supabase_mock.table.return_value.insert.return_value.execute.return_value = insert_result

    store_node(STATE_WITH_SIZING)

    _supabase_mock.table.assert_called_once_with("market_sizing_reports")
    row = _supabase_mock.table.return_value.insert.call_args[0][0]
    assert row["project_id"] == "proj-789"


def test_store_node_marks_failed_on_db_error():
    _supabase_mock.reset_mock()
    _mark_complete.reset_mock()
    _mark_failed.reset_mock()

    _supabase_mock.table.return_value.insert.return_value.execute.side_effect = RuntimeError("DB down")

    result = store_node(STATE_WITH_SIZING)

    assert "error" in result
    _mark_failed.assert_called_once()
    _mark_complete.assert_not_called()
