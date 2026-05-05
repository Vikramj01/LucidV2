/**
 * Signed upload URL flow for vault PDF uploads.
 *
 * Step 1: Client calls GET /api/workspaces/:id/vault/upload-url?filename=foo.pdf
 *         → backend creates vault_document record (queued) + returns a signed upload URL
 * Step 2: Client PUTs the file directly to the signed URL (browser → Supabase Storage, no proxying)
 * Step 3: Client calls POST /api/workspaces/:id/vault/confirm with { document_id }
 *         → backend enqueues the vault_ingest job
 *
 * This keeps large file bytes off the Express server entirely.
 */
import { Router, Request, Response } from 'express'
import { requireAuth, AuthedRequest } from '../middleware/auth'
import { requireWorkspaceMember, WorkspaceRequest } from '../middleware/workspace'
import { supabase } from '../lib/supabase'
import { enqueueJob } from '../lib/jobs'
import { v4 as uuidv4 } from 'uuid'

export const uploadRouter = Router({ mergeParams: true })

// GET /api/workspaces/:id/vault/upload-url
uploadRouter.get(
  '/upload-url',
  requireAuth,
  requireWorkspaceMember,
  async (req: Request, res: Response) => {
    const { user } = req as AuthedRequest
    const { workspace } = req as WorkspaceRequest
    const filename = req.query.filename as string

    if (!filename || !filename.toLowerCase().endsWith('.pdf')) {
      res.status(400).json({ error: 'filename must be a .pdf file', code: 'VALIDATION_ERROR' })
      return
    }

    const docId = uuidv4()
    const filePath = `${workspace.id}/${docId}/${filename}`

    // Create the vault_document record first (status: queued)
    const { data: doc, error: docError } = await supabase
      .from('vault_documents')
      .insert({
        id: docId,
        workspace_id: workspace.id,
        name: filename,
        source_type: 'pdf',
        file_path: filePath,
        status: 'queued',
        created_by: user.id,
      })
      .select()
      .single()

    if (docError || !doc) {
      res.status(500).json({ error: 'Failed to create vault document', code: 'DB_ERROR' })
      return
    }

    // Generate a signed upload URL valid for 5 minutes
    const { data: signedData, error: signedError } = await supabase.storage
      .from('vault-documents')
      .createSignedUploadUrl(filePath)

    if (signedError || !signedData) {
      // Rollback the document record
      await supabase.from('vault_documents').delete().eq('id', docId)
      res.status(500).json({ error: 'Failed to generate upload URL', code: 'STORAGE_ERROR' })
      return
    }

    res.json({
      document_id: docId,
      upload_url: signedData.signedUrl,
      file_path: filePath,
    })
  }
)

// POST /api/workspaces/:id/vault/confirm — called after browser finishes uploading to Storage
uploadRouter.post(
  '/confirm',
  requireAuth,
  requireWorkspaceMember,
  async (req: Request, res: Response) => {
    const { workspace } = req as WorkspaceRequest
    const { document_id, file_size_bytes } = req.body

    if (!document_id) {
      res.status(400).json({ error: 'document_id is required', code: 'VALIDATION_ERROR' })
      return
    }

    // Verify the document belongs to this workspace
    const { data: doc, error: fetchError } = await supabase
      .from('vault_documents')
      .select('id, file_path, status')
      .eq('id', document_id)
      .eq('workspace_id', workspace.id)
      .single()

    if (fetchError || !doc) {
      res.status(404).json({ error: 'Document not found', code: 'NOT_FOUND' })
      return
    }

    if (doc.status !== 'queued') {
      res.status(409).json({ error: 'Document already confirmed', code: 'CONFLICT' })
      return
    }

    // Update file size if provided
    if (file_size_bytes) {
      await supabase
        .from('vault_documents')
        .update({ file_size_bytes })
        .eq('id', document_id)
    }

    // Enqueue the ingestion job
    const job_id = await enqueueJob('vault_ingest', workspace.id, workspace.orgId, {
      document_id,
      source_type: 'pdf',
      file_path: doc.file_path,
    })

    res.json({ document_id, job_id })
  }
)
