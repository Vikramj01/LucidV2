'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'

interface VaultDoc {
  id: string
  name: string
  source_type: 'pdf' | 'url' | 'free_text'
  status: 'pending' | 'processing' | 'ready' | 'failed'
  chunk_count: number | null
  error_message: string | null
  created_at: string
}

const STATUS_STYLES: Record<string, string> = {
  pending:    'text-[#8B949E]',
  processing: 'text-[#388BFD]',
  ready:      'text-[#3FB950]',
  failed:     'text-[#F85149]',
}

const SOURCE_ICONS: Record<string, string> = {
  pdf:        '📄',
  url:        '🌐',
  free_text:  '📝',
}

function DocRow({ doc, workspaceId, onDeleted }: {
  doc: VaultDoc
  workspaceId: string
  onDeleted: (id: string) => void
}) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm(`Delete "${doc.name}"?`)) return
    setDeleting(true)
    try {
      await api.vault.delete(workspaceId, doc.id)
      onDeleted(doc.id)
    } catch {
      setDeleting(false)
    }
  }

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[#21262D] last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base shrink-0">{SOURCE_ICONS[doc.source_type] ?? '📎'}</span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-[#E6EDF3] truncate">{doc.name}</p>
          <p className="text-[10px] text-[#484F58]">
            {new Date(doc.created_at).toLocaleDateString()}
            {doc.chunk_count != null && ` · ${doc.chunk_count} chunks`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-2">
        <span className={`text-xs font-medium capitalize ${STATUS_STYLES[doc.status] ?? 'text-[#8B949E]'}`}>
          {doc.status}
        </span>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-[#484F58] hover:text-[#F85149] transition-colors text-xs disabled:opacity-40"
        >
          {deleting ? '…' : '✕'}
        </button>
      </div>
    </div>
  )
}

function AddUrlForm({ workspaceId, onAdded }: {
  workspaceId: string
  onAdded: () => void
}) {
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    setLoading(true)
    setError(null)
    try {
      await api.vault.addUrl(workspaceId, { url: url.trim(), name: name.trim() || undefined })
      setUrl('')
      setName('')
      onAdded()
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <input
        type="url"
        placeholder="https://example.com"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="w-full px-3 py-2 text-xs rounded-md bg-[#0D1117] border border-[#30363D] text-[#E6EDF3] placeholder-[#484F58] focus:outline-none focus:border-[#388BFD]"
      />
      <input
        type="text"
        placeholder="Label (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-3 py-2 text-xs rounded-md bg-[#0D1117] border border-[#30363D] text-[#E6EDF3] placeholder-[#484F58] focus:outline-none focus:border-[#388BFD]"
      />
      {error && <p className="text-xs text-[#F85149]">{error}</p>}
      <button
        type="submit"
        disabled={loading || !url.trim()}
        className="px-3 py-1.5 text-xs font-medium rounded-md bg-[#21262D] text-[#E6EDF3] hover:bg-[#30363D] disabled:opacity-40 transition-colors"
      >
        {loading ? 'Adding…' : 'Add URL'}
      </button>
    </form>
  )
}

function AddTextForm({ workspaceId, onAdded }: {
  workspaceId: string
  onAdded: () => void
}) {
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !text.trim()) return
    setLoading(true)
    setError(null)
    try {
      await api.vault.addText(workspaceId, { name: name.trim(), text: text.trim() })
      setName('')
      setText('')
      onAdded()
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <input
        type="text"
        placeholder="Document name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-3 py-2 text-xs rounded-md bg-[#0D1117] border border-[#30363D] text-[#E6EDF3] placeholder-[#484F58] focus:outline-none focus:border-[#388BFD]"
      />
      <textarea
        placeholder="Paste brand voice content here…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className="w-full px-3 py-2 text-xs rounded-md bg-[#0D1117] border border-[#30363D] text-[#E6EDF3] placeholder-[#484F58] focus:outline-none focus:border-[#388BFD] resize-none"
      />
      {error && <p className="text-xs text-[#F85149]">{error}</p>}
      <button
        type="submit"
        disabled={loading || !name.trim() || !text.trim()}
        className="px-3 py-1.5 text-xs font-medium rounded-md bg-[#21262D] text-[#E6EDF3] hover:bg-[#30363D] disabled:opacity-40 transition-colors"
      >
        {loading ? 'Adding…' : 'Add Text'}
      </button>
    </form>
  )
}

function UploadPdfForm({ workspaceId, onAdded }: {
  workspaceId: string
  onAdded: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      await api.vault.uploadPdfFile(workspaceId, file)
      if (fileRef.current) fileRef.current.value = ''
      onAdded()
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-[#30363D] hover:border-[#388BFD] cursor-pointer transition-colors">
        <span className="text-lg">📄</span>
        <span className="text-xs text-[#8B949E]">
          {loading ? 'Uploading…' : 'Upload PDF'}
        </span>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleChange}
          disabled={loading}
        />
      </label>
      {error && <p className="text-xs text-[#F85149]">{error}</p>}
    </div>
  )
}

type AddMode = 'url' | 'text' | 'pdf' | null

export function VaultTab({ workspaceId }: { workspaceId: string }) {
  const [docs, setDocs] = useState<VaultDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [addMode, setAddMode] = useState<AddMode>(null)

  function fetchDocs() {
    api.vault.list(workspaceId)
      .then((data) => setDocs(data as VaultDoc[]))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchDocs() }, [workspaceId]) // eslint-disable-line

  function handleAdded() {
    setAddMode(null)
    fetchDocs()
  }

  function handleDeleted(id: string) {
    setDocs((prev) => prev.filter((d) => d.id !== id))
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-[#8B949E] uppercase tracking-wider">
          Brand Voice Vault {!loading && `(${docs.length})`}
        </h2>
        <div className="flex gap-1.5">
          {(['pdf', 'url', 'text'] as AddMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setAddMode(addMode === mode ? null : mode)}
              className={[
                'px-2.5 py-1 text-[10px] font-medium rounded transition-colors',
                addMode === mode
                  ? 'bg-[#388BFD] text-white'
                  : 'bg-[#21262D] text-[#8B949E] hover:text-[#E6EDF3]',
              ].join(' ')}
            >
              {mode === 'pdf' ? '+ PDF' : mode === 'url' ? '+ URL' : '+ Text'}
            </button>
          ))}
        </div>
      </div>

      {/* Add form */}
      {addMode === 'url' && (
        <AddUrlForm workspaceId={workspaceId} onAdded={handleAdded} />
      )}
      {addMode === 'text' && (
        <AddTextForm workspaceId={workspaceId} onAdded={handleAdded} />
      )}
      {addMode === 'pdf' && (
        <UploadPdfForm workspaceId={workspaceId} onAdded={handleAdded} />
      )}

      {/* Document list */}
      {loading ? (
        <p className="text-xs text-[#484F58]">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="text-xs text-[#484F58] text-center py-8">
          No documents yet. Add a PDF, URL, or text to start building your Brand Voice Vault.
        </p>
      ) : (
        <div className="rounded-lg border border-[#30363D] bg-[#161B22] px-4">
          {docs.map((doc) => (
            <DocRow
              key={doc.id}
              doc={doc}
              workspaceId={workspaceId}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}
    </div>
  )
}
