"""
Google Drive file content extraction for Brand Voice Vault ingestion.

Google Docs are exported as plain text; other file types (PDFs, plain
text files) are downloaded as bytes and parsed accordingly.
"""
from __future__ import annotations

import io

import httpx
import pypdf

from app.lib.integrations.token import get_integration_token

DRIVE_API_BASE = "https://www.googleapis.com/drive/v3"
GOOGLE_DOC_MIME = "application/vnd.google-apps.document"


def extract_google_drive_text(integration_id: str, external_file_id: str) -> str:
    token = get_integration_token(integration_id)
    headers = {"Authorization": f"Bearer {token}"}

    metadata_resp = httpx.get(
        f"{DRIVE_API_BASE}/files/{external_file_id}",
        params={"fields": "id,name,mimeType"},
        headers=headers,
        timeout=15.0,
    )
    metadata_resp.raise_for_status()
    metadata = metadata_resp.json()
    mime_type = metadata.get("mimeType", "")

    if mime_type == GOOGLE_DOC_MIME:
        export_resp = httpx.get(
            f"{DRIVE_API_BASE}/files/{external_file_id}/export",
            params={"mimeType": "text/plain"},
            headers=headers,
            timeout=30.0,
        )
        export_resp.raise_for_status()
        return export_resp.text.strip()

    download_resp = httpx.get(
        f"{DRIVE_API_BASE}/files/{external_file_id}",
        params={"alt": "media"},
        headers=headers,
        timeout=30.0,
    )
    download_resp.raise_for_status()
    content_bytes = download_resp.content

    if mime_type == "application/pdf":
        reader = pypdf.PdfReader(io.BytesIO(content_bytes))
        pages = [page.extract_text() for page in reader.pages]
        return "\n\n".join(p.strip() for p in pages if p).strip()

    if mime_type.startswith("text/"):
        return content_bytes.decode("utf-8", errors="replace").strip()

    raise ValueError(f"Unsupported Google Drive file type for ingestion: {mime_type}")
