"""
Unit tests for the Architect Agent pipeline nodes.

No network, no Supabase, no OpenAI, no Anthropic API calls.
Run with: pytest tests/test_architect_agent.py -v
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

VALID_PLAYBOOK = {
    "winning_angle": "AI-first campaign management at half the cost",
    "target_persona": "VP Marketing at Series B SaaS. Needs pipeline fast.",
    "playbook_content": {
        "executive_summary": "Three-channel B2B campaign targeting Series B ops teams.",
        "messaging_framework": {
            "primary_message": "Ship campaigns in hours, not weeks.",
            "proof_points": ["90% faster briefs", "No agency markup", "SOC2 compliant"],
            "cta": "Book a 20-minute demo",
        },
        "channel_plans": [
            {
                "channel": "linkedin",
                "objective": "Reach VP Marketing personas",
                "content_themes": ["AI automation", "ROI proof"],
                "kpis": ["CPL < $80", "CTR > 0.8%"],
            }
        ],
        "differentiation": "Only AI-native platform with brand voice RAG.",
        "risk_flags": ["Limited case studies in target vertical"],
    },
}


def _make_anthropic_client(text: str = json.dumps(VALID_PLAYBOOK)):
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

retrieve_intel_mod = _load("app/nodes/architect/retrieve_project_intel_node.py", "architect_retrieve_project_intel_node")
retrieve_vault_mod = _load("app/nodes/architect/retrieve_vault_node.py", "architect_retrieve_vault_node")
generate_mod = _load("app/nodes/architect/generate_node.py", "architect_generate_node")
store_mod = _load("app/nodes/architect/store_node.py", "architect_store_node")

retrieve_project_intel_node = retrieve_intel_mod.retrieve_project_intel_node
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

ICP_PROFILE = {
    "id": "icp-001",
    "firmographics": {"company_size": "50-500", "industry": ["SaaS"], "revenue_range": "$5M-$50M", "geography": ["NA"]},
    "personas": [{"title": "VP Marketing", "department": "Marketing", "seniority": "VP", "pain_points": [], "buying_triggers": [], "decision_role": "economic buyer"}],
}

MARKET_SIZING_REPORT = {
    "id": "ms-001",
    "tam_estimate": {"value": "$4.2B", "currency": "USD", "methodology": "top-down", "assumptions": []},
}

BASE_STATE = {
    "agent_run_id": "run-xyz",
    "workspace_id": "ws-456",
    "project_id": "proj-789",
    "campaign_id": "camp-111",
    "research_signal_id": None,
    "icp_profile_id": None,
    "market_sizing_report_id": None,
    "campaign_goal": "leads",
    "channels": ["linkedin", "email"],
    "research_signal": RESEARCH_SIGNAL,
    "icp_profile": None,
    "market_sizing_report": None,
    "vault_chunks": [],
    "playbook_data": {},
    "playbook_id": "",
    "error": None,
}

_mark_complete = sys.modules["app.lib.agent_run"].mark_complete
_mark_failed = sys.modules["app.lib.agent_run"].mark_failed


# ── retrieve_project_intel_node tests ─────────────────────────────────────────

def _mock_table_chain(rows_by_table: dict[str, list[dict]]) -> None:
    """Configure _supabase_mock.table(name)... .execute() to return rows_by_table[name]."""
    def table_side_effect(name):
        m = MagicMock()
        rows = rows_by_table.get(name, [])
        result = MagicMock()
        result.data = rows
        # both .eq(id).execute() and .order().limit().execute() chains resolve to `result`
        m.select.return_value.eq.return_value.eq.return_value.execute.return_value = result
        m.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = result
        return m
    _supabase_mock.table.side_effect = table_side_effect


def test_retrieve_project_intel_node_requires_research_signal():
    _supabase_mock.reset_mock()
    _mock_table_chain({"research_signals": [], "icp_profiles": [], "market_sizing_reports": []})

    result = retrieve_project_intel_node({**BASE_STATE})

    assert "error" in result
    assert "Research to have run" in result["error"]


def test_retrieve_project_intel_node_works_without_icp_or_market_sizing():
    _supabase_mock.reset_mock()
    _mock_table_chain({
        "research_signals": [RESEARCH_SIGNAL],
        "icp_profiles": [],
        "market_sizing_reports": [],
    })

    result = retrieve_project_intel_node({**BASE_STATE})

    assert "error" not in result
    assert result["research_signal"]["id"] == "rs-001"
    assert result["icp_profile"] is None
    assert result["market_sizing_report"] is None


def test_retrieve_project_intel_node_includes_icp_and_market_sizing_when_present():
    _supabase_mock.reset_mock()
    _mock_table_chain({
        "research_signals": [RESEARCH_SIGNAL],
        "icp_profiles": [ICP_PROFILE],
        "market_sizing_reports": [MARKET_SIZING_REPORT],
    })

    result = retrieve_project_intel_node({**BASE_STATE})

    assert result["icp_profile"]["id"] == "icp-001"
    assert result["market_sizing_report"]["id"] == "ms-001"


# ── retrieve_vault_node tests ─────────────────────────────────────────────────

def test_retrieve_vault_node_calls_rpc_and_returns_chunks():
    _supabase_mock.reset_mock()
    _supabase_mock.table.side_effect = None
    rpc_result = MagicMock()
    rpc_result.data = [
        {"chunk_id": "c1", "document_id": "d1", "content": "Brand voice chunk 1", "similarity": 0.92},
        {"chunk_id": "c2", "document_id": "d1", "content": "Brand voice chunk 2", "similarity": 0.88},
    ]
    _supabase_mock.rpc.return_value.execute.return_value = rpc_result

    result = retrieve_vault_node({**BASE_STATE})

    assert "vault_chunks" in result
    assert len(result["vault_chunks"]) == 2
    _supabase_mock.rpc.assert_called_once()
    call_args = _supabase_mock.rpc.call_args
    assert call_args[0][0] == "retrieve_vault_context"


def test_retrieve_vault_node_handles_empty_vault():
    _supabase_mock.reset_mock()
    _supabase_mock.table.side_effect = None
    rpc_result = MagicMock()
    rpc_result.data = []
    _supabase_mock.rpc.return_value.execute.return_value = rpc_result

    result = retrieve_vault_node({**BASE_STATE})

    assert "vault_chunks" in result
    assert result["vault_chunks"] == []
    assert not result.get("error")


def test_retrieve_vault_node_returns_error_on_exception():
    _supabase_mock.reset_mock()
    _supabase_mock.table.side_effect = None
    _supabase_mock.rpc.side_effect = RuntimeError("RPC failed")

    result = retrieve_vault_node({**BASE_STATE})

    assert "error" in result
    _supabase_mock.rpc.side_effect = None


def test_retrieve_vault_node_incorporates_icp_personas_into_query():
    _supabase_mock.reset_mock()
    _supabase_mock.table.side_effect = None
    rpc_result = MagicMock()
    rpc_result.data = []
    _supabase_mock.rpc.return_value.execute.return_value = rpc_result

    fake_openai = _FakeOpenAIClient()
    with patch.object(retrieve_vault_mod, "OpenAI", return_value=fake_openai):
        retrieve_vault_node({**BASE_STATE, "icp_profile": ICP_PROFILE})

    embed_call = fake_openai.embeddings.create.call_args
    query_text = embed_call.kwargs["input"][0]
    assert "VP Marketing" in query_text


# ── generate_node tests ───────────────────────────────────────────────────────

STATE_WITH_CHUNKS = {
    **BASE_STATE,
    "vault_chunks": [{"content": "We are a bold, direct brand.", "similarity": 0.9}],
}


def test_generate_node_returns_playbook_data():
    client = _make_anthropic_client(json.dumps(VALID_PLAYBOOK))
    with patch.object(generate_mod.anthropic, "Anthropic", return_value=client):
        result = generate_node(STATE_WITH_CHUNKS)
    assert "playbook_data" in result
    assert "winning_angle" in result["playbook_data"]
    assert "playbook_content" in result["playbook_data"]


def test_generate_node_validates_required_keys():
    incomplete = {"winning_angle": "some angle"}  # missing target_persona and playbook_content
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
    wrapped = f"```json\n{json.dumps(VALID_PLAYBOOK)}\n```"
    client = _make_anthropic_client(wrapped)
    with patch.object(generate_mod.anthropic, "Anthropic", return_value=client):
        result = generate_node(STATE_WITH_CHUNKS)
    assert "playbook_data" in result
    assert not result.get("error")


def test_generate_node_works_with_empty_vault_chunks():
    """Should still generate even when vault is empty (uses empty context block)."""
    client = _make_anthropic_client(json.dumps(VALID_PLAYBOOK))
    state_no_chunks = {**STATE_WITH_CHUNKS, "vault_chunks": []}
    with patch.object(generate_mod.anthropic, "Anthropic", return_value=client):
        result = generate_node(state_no_chunks)
    assert "playbook_data" in result


def test_generate_node_works_without_icp_or_market_sizing():
    """Architect must still work with Research + Vault alone."""
    client = _make_anthropic_client(json.dumps(VALID_PLAYBOOK))
    with patch.object(generate_mod.anthropic, "Anthropic", return_value=client):
        result = generate_node({**STATE_WITH_CHUNKS, "icp_profile": None, "market_sizing_report": None})
    assert "playbook_data" in result
    call_kwargs = client.messages.create.call_args.kwargs
    user_content = call_kwargs["messages"][0]["content"]
    assert "Not available" in user_content


def test_generate_node_includes_icp_and_market_sizing_when_present():
    client = _make_anthropic_client(json.dumps(VALID_PLAYBOOK))
    with patch.object(generate_mod.anthropic, "Anthropic", return_value=client):
        generate_node({**STATE_WITH_CHUNKS, "icp_profile": ICP_PROFILE, "market_sizing_report": MARKET_SIZING_REPORT})
    call_kwargs = client.messages.create.call_args.kwargs
    user_content = call_kwargs["messages"][0]["content"]
    assert "icp-001" in user_content
    assert "ms-001" in user_content


# ── store_node tests ──────────────────────────────────────────────────────────

STATE_WITH_PLAYBOOK = {
    **BASE_STATE,
    "research_signal_id": "rs-001",
    "icp_profile_id": "icp-001",
    "market_sizing_report_id": "ms-001",
    "playbook_data": VALID_PLAYBOOK,
}


def test_store_node_inserts_row_and_marks_complete():
    _supabase_mock.reset_mock()
    _supabase_mock.table.side_effect = None
    _mark_complete.reset_mock()
    _mark_failed.reset_mock()

    insert_result = MagicMock()
    insert_result.error = None
    _supabase_mock.table.return_value.insert.return_value.execute.return_value = insert_result

    result = store_node(STATE_WITH_PLAYBOOK)

    assert "playbook_id" in result
    assert result["playbook_id"]
    _mark_complete.assert_called_once_with("run-xyz")
    _mark_failed.assert_not_called()


def test_store_node_sets_status_draft_and_campaign_scoping():
    _supabase_mock.reset_mock()
    _supabase_mock.table.side_effect = None
    insert_result = MagicMock()
    insert_result.error = None
    _supabase_mock.table.return_value.insert.return_value.execute.return_value = insert_result

    store_node(STATE_WITH_PLAYBOOK)

    insert_call = _supabase_mock.table.return_value.insert.call_args
    row = insert_call[0][0]
    assert row["status"] == "draft"
    assert row["version"] == 1
    assert row["campaign_id"] == "camp-111"
    assert row["icp_profile_id"] == "icp-001"
    assert row["market_sizing_report_id"] == "ms-001"


def test_store_node_marks_failed_on_db_error():
    _supabase_mock.reset_mock()
    _supabase_mock.table.side_effect = None
    _mark_complete.reset_mock()
    _mark_failed.reset_mock()

    _supabase_mock.table.return_value.insert.return_value.execute.side_effect = RuntimeError("DB down")

    result = store_node(STATE_WITH_PLAYBOOK)

    assert "error" in result
    _mark_failed.assert_called_once()
    _mark_complete.assert_not_called()
