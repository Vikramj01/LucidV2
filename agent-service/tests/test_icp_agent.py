"""
Unit tests for the ICP Agent pipeline nodes.

No network, no Supabase, no OpenAI, no Anthropic API calls.
Run with: pytest tests/test_icp_agent.py -v
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
_settings.openai_api_key = "fake-oai-key"
_settings.anthropic_api_key = "fake-anthropic-key"
sys.modules["app.lib.settings"].settings = _settings

_supabase_mock = MagicMock()
sys.modules["app.lib.supabase"].get_supabase = lambda: _supabase_mock

sys.modules["app.lib.agent_run"].mark_running = MagicMock()
sys.modules["app.lib.agent_run"].mark_complete = MagicMock()
sys.modules["app.lib.agent_run"].mark_failed = MagicMock()

# openai stub
_openai_mod = _make_module("openai")

class _FakeOpenAIClient:
    def __init__(self, api_key=""):
        self.embeddings = MagicMock()
        emb_response = MagicMock()
        emb_item = MagicMock()
        emb_item.embedding = [0.1] * 1536
        emb_response.data = [emb_item]
        self.embeddings.create.return_value = emb_response

_openai_mod.OpenAI = _FakeOpenAIClient

# anthropic stub
_anthropic_mod = _make_module("anthropic")

VALID_ICP = {
    "firmographics": {
        "company_size": "50-500 employees",
        "industry": ["B2B SaaS"],
        "revenue_range": "$5M-$50M ARR",
        "geography": ["North America"],
    },
    "personas": [
        {
            "title": "VP Marketing",
            "department": "Marketing",
            "seniority": "VP",
            "pain_points": ["Slow campaign turnaround"],
            "buying_triggers": ["Series B funding"],
            "decision_role": "economic buyer",
        }
    ],
    "pain_points": ["Slow campaign turnaround", "Poor onboarding"],
    "buying_triggers": ["Series B funding", "Hiring ops staff"],
    "sources": ["research_signal:rs-001"],
}


def _make_anthropic_client(text: str = json.dumps(VALID_ICP)):
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

retrieve_research_mod = _load("app/nodes/icp/retrieve_research_node.py", "icp_retrieve_research_node")
retrieve_vault_mod = _load("app/nodes/icp/retrieve_vault_node.py", "icp_retrieve_vault_node")
generate_mod = _load("app/nodes/icp/generate_node.py", "icp_generate_node")
store_mod = _load("app/nodes/icp/store_node.py", "icp_store_node")

retrieve_research_node = retrieve_research_mod.retrieve_research_node
retrieve_vault_node = retrieve_vault_mod.retrieve_vault_node
generate_node = generate_mod.generate_node
store_node = store_mod.store_node


# ── Fixtures ──────────────────────────────────────────────────────────────────

RESEARCH_SIGNAL = {
    "id": "rs-001",
    "market_gaps": ["No AI assistant", "Poor onboarding"],
    "recommended_angles": ["AI-first approach", "5-minute onboarding"],
    "intent_triggers": ["Hiring ops staff"],
    "competitor_profiles": [],
}

BASE_STATE = {
    "agent_run_id": "run-icp-1",
    "workspace_id": "ws-456",
    "project_id": "proj-789",
    "research_signal_id": None,
    "research_signal": RESEARCH_SIGNAL,
    "vault_chunks": [],
    "icp_data": {},
    "icp_id": "",
    "error": None,
}

_mark_complete = sys.modules["app.lib.agent_run"].mark_complete
_mark_failed = sys.modules["app.lib.agent_run"].mark_failed


# ── retrieve_research_node tests ──────────────────────────────────────────────

def test_retrieve_research_node_uses_given_signal_id():
    _supabase_mock.reset_mock()
    row_result = MagicMock()
    row_result.data = [RESEARCH_SIGNAL]
    _supabase_mock.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = row_result

    result = retrieve_research_node({**BASE_STATE, "research_signal_id": "rs-001"})

    assert result["research_signal"]["id"] == "rs-001"
    assert result["research_signal_id"] == "rs-001"


def test_retrieve_research_node_falls_back_to_latest():
    _supabase_mock.reset_mock()
    row_result = MagicMock()
    row_result.data = [RESEARCH_SIGNAL]
    chain = _supabase_mock.table.return_value.select.return_value.eq.return_value
    chain.order.return_value.limit.return_value.execute.return_value = row_result

    result = retrieve_research_node({**BASE_STATE, "research_signal_id": None})

    assert result["research_signal"]["id"] == "rs-001"


def test_retrieve_research_node_errors_when_none_found():
    _supabase_mock.reset_mock()
    row_result = MagicMock()
    row_result.data = []
    chain = _supabase_mock.table.return_value.select.return_value.eq.return_value
    chain.order.return_value.limit.return_value.execute.return_value = row_result

    result = retrieve_research_node({**BASE_STATE, "research_signal_id": None})

    assert "error" in result
    assert "run the Research Agent first" in result["error"]


# ── retrieve_vault_node tests ─────────────────────────────────────────────────

def test_retrieve_vault_node_calls_rpc_and_returns_chunks():
    _supabase_mock.reset_mock()
    rpc_result = MagicMock()
    rpc_result.data = [
        {"chunk_id": "c1", "document_id": "d1", "content": "Brand voice chunk 1", "similarity": 0.92},
    ]
    _supabase_mock.rpc.return_value.execute.return_value = rpc_result

    result = retrieve_vault_node({**BASE_STATE})

    assert "vault_chunks" in result
    assert len(result["vault_chunks"]) == 1
    _supabase_mock.rpc.assert_called_once()
    assert _supabase_mock.rpc.call_args[0][0] == "retrieve_vault_context"


def test_retrieve_vault_node_returns_error_on_exception():
    _supabase_mock.reset_mock()
    _supabase_mock.rpc.side_effect = RuntimeError("RPC failed")

    result = retrieve_vault_node({**BASE_STATE})

    assert "error" in result
    _supabase_mock.rpc.side_effect = None


# ── generate_node tests ───────────────────────────────────────────────────────

STATE_WITH_CHUNKS = {
    **BASE_STATE,
    "vault_chunks": [{"content": "We are a bold, direct brand.", "similarity": 0.9}],
}


def test_generate_node_returns_icp_data():
    client = _make_anthropic_client(json.dumps(VALID_ICP))
    with patch.object(generate_mod.anthropic, "Anthropic", return_value=client):
        result = generate_node(STATE_WITH_CHUNKS)
    assert "icp_data" in result
    assert "firmographics" in result["icp_data"]
    assert "personas" in result["icp_data"]


def test_generate_node_validates_required_keys():
    incomplete = {"firmographics": {}}
    client = _make_anthropic_client(json.dumps(incomplete))
    with patch.object(generate_mod.anthropic, "Anthropic", return_value=client):
        result = generate_node(STATE_WITH_CHUNKS)
    assert "error" in result


def test_generate_node_handles_invalid_json():
    client = _make_anthropic_client("not json at all")
    with patch.object(generate_mod.anthropic, "Anthropic", return_value=client):
        result = generate_node(STATE_WITH_CHUNKS)
    assert "error" in result


def test_generate_node_strips_markdown_fences():
    wrapped = f"```json\n{json.dumps(VALID_ICP)}\n```"
    client = _make_anthropic_client(wrapped)
    with patch.object(generate_mod.anthropic, "Anthropic", return_value=client):
        result = generate_node(STATE_WITH_CHUNKS)
    assert "icp_data" in result
    assert not result.get("error")


# ── store_node tests ──────────────────────────────────────────────────────────

STATE_WITH_ICP = {
    **BASE_STATE,
    "research_signal_id": "rs-001",
    "icp_data": VALID_ICP,
}


def test_store_node_inserts_row_and_marks_complete():
    _supabase_mock.reset_mock()
    _mark_complete.reset_mock()
    _mark_failed.reset_mock()

    insert_result = MagicMock()
    insert_result.error = None
    _supabase_mock.table.return_value.insert.return_value.execute.return_value = insert_result

    result = store_node(STATE_WITH_ICP)

    assert "icp_id" in result
    assert result["icp_id"]
    _mark_complete.assert_called_once_with("run-icp-1")
    _mark_failed.assert_not_called()


def test_store_node_writes_to_icp_profiles_table_with_project_id():
    _supabase_mock.reset_mock()
    insert_result = MagicMock()
    insert_result.error = None
    _supabase_mock.table.return_value.insert.return_value.execute.return_value = insert_result

    store_node(STATE_WITH_ICP)

    _supabase_mock.table.assert_called_once_with("icp_profiles")
    row = _supabase_mock.table.return_value.insert.call_args[0][0]
    assert row["project_id"] == "proj-789"
    assert row["research_signal_id"] == "rs-001"


def test_store_node_marks_failed_on_db_error():
    _supabase_mock.reset_mock()
    _mark_complete.reset_mock()
    _mark_failed.reset_mock()

    _supabase_mock.table.return_value.insert.return_value.execute.side_effect = RuntimeError("DB down")

    result = store_node(STATE_WITH_ICP)

    assert "error" in result
    _mark_failed.assert_called_once()
    _mark_complete.assert_not_called()
