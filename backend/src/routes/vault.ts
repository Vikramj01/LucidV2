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
