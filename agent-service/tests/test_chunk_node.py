"""
Unit tests for chunk_node.split_into_chunks.

Pure function — no env vars, no network, no Supabase, no tiktoken download.
Run with: pytest tests/test_chunk_node.py -v
"""
import sys
import types
import pathlib
import importlib.util

import pytest

# ── Stub out the settings/supabase import chain before loading the module ─────

sys.modules.setdefault("app", types.ModuleType("app"))
sys.modules.setdefault("app.lib", types.ModuleType("app.lib"))
sys.modules.setdefault("app.lib.settings", types.ModuleType("app.lib.settings"))
sys.modules.setdefault("app.lib.supabase", types.ModuleType("app.lib.supabase"))

# ── Fake tiktoken encoder ─────────────────────────────────────────────────────
# Treats each whitespace-separated word as one token.
# encode() returns indices into the original word list; decode() reverses that.

class _FakeEncoding:
    """
    Minimal tiktoken-compatible encoder backed by whitespace splitting.

    Token IDs are sequential indices assigned per encode() call, but we store
    the word list alongside so decode() can reconstruct the text exactly.

    NOTE: This encoder intentionally uses a *global* word registry so that
    tokens from one encode() call can be decoded by a later decode() call,
    which is exactly how split_into_chunks uses the encoder.
    """

    def __init__(self) -> None:
        self._words: list[str] = []  # registry: index → word

    def encode(self, text: str) -> list[int]:
        words = text.split()
        ids: list[int] = []
        for word in words:
            # Intern each word so the same word always gets the same id
            if word not in self._words:
                self._words.append(word)
            ids.append(self._words.index(word))
        return ids

    def decode(self, token_ids: list[int]) -> str:
        return " ".join(self._words[i] for i in token_ids)


_fake_encoding = _FakeEncoding()

# Patch tiktoken BEFORE loading chunk_node so the module-level
# `tiktoken.get_encoding(ENCODING_NAME)` call returns our fake.
tiktoken_stub = types.ModuleType("tiktoken")
tiktoken_stub.get_encoding = lambda name: _fake_encoding  # type: ignore[attr-defined]
sys.modules["tiktoken"] = tiktoken_stub

# ── Load chunk_node ───────────────────────────────────────────────────────────

spec = importlib.util.spec_from_file_location(
    "chunk_node",
    pathlib.Path(__file__).parent.parent / "app" / "nodes" / "vault" / "chunk_node.py",
)
chunk_module = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
spec.loader.exec_module(chunk_module)  # type: ignore[union-attr]

split_into_chunks = chunk_module.split_into_chunks
ENCODING_NAME = chunk_module.ENCODING_NAME


# ── Helpers ───────────────────────────────────────────────────────────────────

def token_count(text: str) -> int:
    """Word-based token count matching the fake encoder."""
    return len(text.split())


def make_text(n_tokens: int) -> str:
    """Return a string of exactly n_tokens *unique* words (= n_tokens tokens)."""
    return " ".join(f"word{i}" for i in range(n_tokens))


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_empty_text_returns_no_chunks():
    assert split_into_chunks("") == []


def test_short_text_returns_single_chunk():
    text = "alpha bravo charlie delta echo"
    chunks = split_into_chunks(text, chunk_size=500, overlap=50)
    assert len(chunks) == 1
    assert chunks[0] == text.strip()


def test_long_text_splits_into_multiple_chunks():
    text = make_text(1200)
    chunks = split_into_chunks(text, chunk_size=500, overlap=50)
    assert len(chunks) >= 3


def test_chunk_token_counts_within_limit():
    text = make_text(2000)
    chunks = split_into_chunks(text, chunk_size=500, overlap=50)
    for chunk in chunks:
        count = token_count(chunk)
        assert count <= 500, f"Chunk exceeded 500 tokens: {count}"


def test_overlap_causes_token_repetition():
    """With overlap > 0, adjacent chunks share some tokens."""
    text = make_text(1200)
    chunks = split_into_chunks(text, chunk_size=500, overlap=100)
    assert len(chunks) >= 2
    t0 = _fake_encoding.encode(chunks[0])
    t1 = _fake_encoding.encode(chunks[1])
    overlap_tokens = t0[-100:]
    head_tokens = t1[:100]
    assert overlap_tokens == head_tokens, (
        "Expected 100-token overlap between chunk 0 and chunk 1"
    )


def test_no_empty_chunks_produced():
    text = make_text(1500)
    chunks = split_into_chunks(text, chunk_size=500, overlap=50)
    for chunk in chunks:
        assert chunk.strip() != "", "Got an empty chunk"


def test_exact_chunk_size_text():
    """Text that is exactly chunk_size tokens should produce exactly one chunk."""
    text = make_text(500)
    chunks = split_into_chunks(text, chunk_size=500, overlap=50)
    assert len(chunks) == 1


@pytest.mark.parametrize("chunk_size,overlap", [
    (200, 20),
    (500, 50),
    (1000, 100),
])
def test_parametrized_chunk_sizes(chunk_size: int, overlap: int):
    text = make_text(chunk_size * 3)
    chunks = split_into_chunks(text, chunk_size=chunk_size, overlap=overlap)
    assert len(chunks) >= 2
    for chunk in chunks:
        assert token_count(chunk) <= chunk_size
