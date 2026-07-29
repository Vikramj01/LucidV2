import { Router, Request, Response } from 'express'
import { requireAuth, AuthedRequest } from '../middleware/auth'
import { requireWorkspaceMember, WorkspaceRequest } from '../middleware/workspace'
import { supabase } from '../lib/supabase'
import { enqueueJob } from '../lib/jobs'
import { param } from '../lib/params'
import { v4 as uuidv4 } from 'uuid'

export const vaultRouter = Router({ mergeParams: true })

// GET /api/workspaces/:id/vault
vaultRouter.get('/', requireAuth, requireWorkspaceMember, async (req: Request, res: Response) => {
  const { workspace } = req as WorkspaceRequest

  const { data, error } = await supabase
    .from('vault_documents')
    .select('*')
    .eq('workspace_id', workspace.id)
    .order('created_at', { ascending: false })

  if (error) {
    res.status(500).json({ error: 'Failed to list vault documents', code: 'DB_ERROR' })
    return
  }

  res.json(data)
})

// POST /api/workspaces/:id/vault/upload — PDF upload
vaultRouter.post(
  '/upload',
  requireAuth,
  requireWorkspaceMember,
  async (req: Request, res: Response) => {
    const { user } = req as AuthedRequest
    const { workspace } = req as WorkspaceRequest
    const { name, file_path, file_size_bytes } = req.body

    if (!name || !file_path) {
      res.status(400).json({ error: 'name and file_path are required', code: 'VALIDATION_ERROR' })
      return
    }

    const { data: doc, error: docError } = await supabase
      .from('vault_documents')
      .insert({
        id: uuidv4(),
        workspace_id: workspace.id,
        name,
        source_type: 'pdf',
        file_path,
        file_size_bytes: file_size_bytes ?? null,
        status: 'queued',
        created_by: user.id,
      })
      .select()
      .single()

    if (docError || !doc) {
      res.status(500).json({ error: 'Failed to create vault document', code: 'DB_ERROR' })
      return
    }

    const job_id = await enqueueJob('vault_ingest', workspace.id, workspace.orgId, {
      document_id: doc.id,
      source_type: 'pdf',
      file_path,
    })

    res.status(201).json({ ...doc, job_id })
  }
)

// POST /api/workspaces/:id/vault/url — URL ingestion
vaultRouter.post(
  '/url',
  requireAuth,
  requireWorkspaceMember,
  async (req: Request, res: Response) => {
    const { user } = req as AuthedRequest
    const { workspace } = req as WorkspaceRequest
    const { url, name } = req.body

    if (!url) {
      res.status(400).json({ error: 'url is required', code: 'VALIDATION_ERROR' })
      return
    }

    const { data: doc, error: docError } = await supabase
      .from('vault_documents')
      .insert({
        id: uuidv4(),
        workspace_id: workspace.id,
        name: name ?? url,
        source_type: 'url',
        status: 'queued',
        created_by: user.id,
      })
      .select()
      .single()

    if (docError || !doc) {
      res.status(500).json({ error: 'Failed to create vault document', code: 'DB_ERROR' })
      return
    }

    const job_id = await enqueueJob('vault_ingest', workspace.id, workspace.orgId, {
      document_id: doc.id,
      source_type: 'url',
      url,
    })

    res.status(201).json({ ...doc, job_id })
  }
)

// POST /api/workspaces/:id/vault/text — free text ingestion
vaultRouter.post(
  '/text',
  requireAuth,
  requireWorkspaceMember,
  async (req: Request, res: Response) => {
    const { user } = req as AuthedRequest
    const { workspace } = req as WorkspaceRequest
    const { name, text } = req.body

    if (!text || !name) {
      res.status(400).json({ error: 'name and text are required', code: 'VALIDATION_ERROR' })
      return
    }

    const { data: doc, error: docError } = await supabase
      .from('vault_documents')
      .insert({
        id: uuidv4(),
        workspace_id: workspace.id,
        name,
        source_type: 'free_text',
        status: 'queued',
        created_by: user.id,
      })
      .select()
      .single()

    if (docError || !doc) {
      res.status(500).json({ error: 'Failed to create vault document', code: 'DB_ERROR' })
      return
    }

    const job_id = await enqueueJob('vault_ingest', workspace.id, workspace.orgId, {
      document_id: doc.id,
      source_type: 'free_text',
      text,
    })

    res.status(201).json({ ...doc, job_id })
  }
)

// POST /api/workspaces/:id/vault/drive — ingest a file from a connected Google Drive account.
// MVP: paste a file ID (or share link) after connecting — no in-app file picker yet.
vaultRouter.post(
  '/drive',
  requireAuth,
  requireWorkspaceMember,
  async (req: Request, res: Response) => {
    const { user } = req as AuthedRequest
    const { workspace } = req as WorkspaceRequest
    const { file_id, name } = req.body

    if (!file_id || !name) {
      res.status(400).json({ error: 'file_id and name are required', code: 'VALIDATION_ERROR' })
      return
    }

    const { data: integration } = await supabase
      .from('workspace_integrations')
      .select('id, status')
      .eq('workspace_id', workspace.id)
      .eq('provider', 'google_drive')
      .single()

    if (!integration || integration.status !== 'connected') {
      res.status(409).json({ error: 'Google Drive is not connected for this workspace', code: 'NOT_CONNECTED' })
      return
    }

    const { data: doc, error: docError } = await supabase
      .from('vault_documents')
      .insert({
        id: uuidv4(),
        workspace_id: workspace.id,
        name,
        source_type: 'google_drive',
        integration_id: integration.id,
        external_file_id: file_id,
        status: 'queued',
        created_by: user.id,
      })
      .select()
      .single()

    if (docError || !doc) {
      res.status(500).json({ error: 'Failed to create vault document', code: 'DB_ERROR' })
      return
    }

    const job_id = await enqueueJob('vault_ingest', workspace.id, workspace.orgId, {
      document_id: doc.id,
      source_type: 'google_drive',
      integration_id: integration.id,
      external_file_id: file_id,
    })

    res.status(201).json({ ...doc, job_id })
  }
)

// POST /api/workspaces/:id/vault/notion — ingest a page from a connected Notion account.
// MVP: paste a page URL or ID after connecting — no in-app file picker yet.
vaultRouter.post(
  '/notion',
  requireAuth,
  requireWorkspaceMember,
  async (req: Request, res: Response) => {
    const { user } = req as AuthedRequest
    const { workspace } = req as WorkspaceRequest
    const { page_id_or_url, name } = req.body

    if (!page_id_or_url || !name) {
      res.status(400).json({ error: 'page_id_or_url and name are required', code: 'VALIDATION_ERROR' })
      return
    }

    const pageId = extractNotionPageId(page_id_or_url)
    if (!pageId) {
      res.status(400).json({ error: 'Could not parse a Notion page id from page_id_or_url', code: 'VALIDATION_ERROR' })
      return
    }

    const { data: integration } = await supabase
      .from('workspace_integrations')
      .select('id, status')
      .eq('workspace_id', workspace.id)
      .eq('provider', 'notion')
      .single()

    if (!integration || integration.status !== 'connected') {
      res.status(409).json({ error: 'Notion is not connected for this workspace', code: 'NOT_CONNECTED' })
      return
    }

    const { data: doc, error: docError } = await supabase
      .from('vault_documents')
      .insert({
        id: uuidv4(),
        workspace_id: workspace.id,
        name,
        source_type: 'notion',
        integration_id: integration.id,
        external_file_id: pageId,
        status: 'queued',
        created_by: user.id,
      })
      .select()
      .single()

    if (docError || !doc) {
      res.status(500).json({ error: 'Failed to create vault document', code: 'DB_ERROR' })
      return
    }

    const job_id = await enqueueJob('vault_ingest', workspace.id, workspace.orgId, {
      document_id: doc.id,
      source_type: 'notion',
      integration_id: integration.id,
      external_file_id: pageId,
    })

    res.status(201).json({ ...doc, job_id })
  }
)

// DELETE /api/workspaces/:id/vault/:docId
vaultRouter.delete(
  '/:docId',
  requireAuth,
  requireWorkspaceMember,
  async (req: Request, res: Response) => {
    const { workspace } = req as WorkspaceRequest
    const docId = param(req.params.docId)

    const { error } = await supabase
      .from('vault_documents')
      .delete()
      .eq('id', docId)
      .eq('workspace_id', workspace.id)

    if (error) {
      res.status(500).json({ error: 'Failed to delete document', code: 'DB_ERROR' })
      return
    }

    res.status(204).send()
  }
)

// Extracts a Notion page id from either a bare id or a pasted page URL.
// Notion URLs end in a 32-character hex id (dashed or not); this normalises
// either form to the canonical dashed UUID format the Notion API expects.
function extractNotionPageId(input: string): string | null {
  const trimmed = input.trim()

  const bareMatch = trimmed.match(
    /^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$/
  )
  if (bareMatch) return normalizeToUuid(bareMatch[0])

  const urlMatch = trimmed.match(/([0-9a-fA-F]{32})(?:[?#]|$)/)
  if (urlMatch) return normalizeToUuid(urlMatch[1])

  return null
}

function normalizeToUuid(id: string): string {
  const hex = id.replace(/-/g, '')
  if (hex.length !== 32) return id
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
