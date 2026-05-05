'use client'

import { useEffect, useRef, useState } from 'react'
import { useChatStore, ChatPhase } from '@/store/chat'
import { useAgentStore } from '@/store/agent'
import { api } from '@/lib/api'
import { ChatBubble } from './ChatBubble'

// ── Phase scripts ─────────────────────────────────────────────────────────────
// Vimi's opening message for each phase

const PHASE_GREETINGS: Partial<Record<ChatPhase, string>> = {
  WELCOME:
    "Hi, I'm Vimi — your AI marketing strategist. Your workspace is ready. Let's build your Brand Voice Vault first so I understand your brand before we run market intelligence. Add a brand document to get started.",
  VAULT_INTRO:
    "Time to build your Brand Voice Vault. Add PDFs, URLs, or paste text from your brand guidelines, website, or previous campaigns. The more context I have, the sharper your playbooks will be.",
  VAULT_COMPLETE:
    "Your vault is building. Once the documents are processed, we'll move on to competitor analysis. You can also add more documents any time from the Vault tab.",
  INTEL_SETUP:
    "Let's run competitor intelligence. Give me up to 5 competitor URLs and a few industry keywords, and I'll produce a structured Market Signal with gaps and positioning angles.",
  INTEL_RUNNING:
    "Intel Agent is running — scraping competitors and extracting insights. This usually takes 30–60 seconds. I'll let you know when it's done.",
  ARCHITECT_SETUP:
    "Market Signal is ready. Now let's build your Campaign Playbook. What's the campaign goal and which channels are you targeting?",
  ARCHITECT_RUNNING:
    "Architect Agent is running — combining your Brand Voice Vault with the Market Signal to generate your Campaign Playbook. Almost there.",
  ACTIVE:
    "Your Campaign Playbook is ready in Mission Control. Review and approve it when you're happy. I'm here if you want to adjust the brief or run a new analysis.",
}

// ── Phase input components ────────────────────────────────────────────────────

function IntelSetupInput({
  workspaceId,
  onSubmit,
}: {
  workspaceId: string
  onSubmit: (urls: string[], keywords: string) => void
}) {
  const [urls, setUrls] = useState('')
  const [keywords, setKeywords] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const urlList = urls
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean)
    if (urlList.length === 0) return
    setLoading(true)
    setError(null)
    try {
      await api.agents.runIntel(workspaceId, {
        competitor_urls: urlList,
        industry_keywords: keywords.trim(),
      })
      onSubmit(urlList, keywords)
    } catch (err) {
      setError(String(err))
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        placeholder={"Competitor URLs (one per line)\nhttps://acme.com\nhttps://rival.io"}
        value={urls}
        onChange={(e) => setUrls(e.target.value)}
        rows={3}
        className="w-full px-3 py-2 text-xs rounded-lg bg-[#0D1117] border border-[#30363D] text-[#E6EDF3] placeholder-[#484F58] focus:outline-none focus:border-[#388BFD] resize-none"
      />
      <input
        type="text"
        placeholder="Industry keywords (e.g. B2B SaaS marketing automation)"
        value={keywords}
        onChange={(e) => setKeywords(e.target.value)}
        className="w-full px-3 py-2 text-xs rounded-lg bg-[#0D1117] border border-[#30363D] text-[#E6EDF3] placeholder-[#484F58] focus:outline-none focus:border-[#388BFD]"
      />
      {error && <p className="text-xs text-[#F85149]">{error}</p>}
      <button
        type="submit"
        disabled={loading || !urls.trim()}
        className="w-full py-2 text-xs font-medium rounded-lg bg-[#2D7DD2] text-white hover:bg-[#388BFD] disabled:opacity-40 transition-colors"
      >
        {loading ? 'Launching Intel Agent…' : 'Run Intel Agent'}
      </button>
    </form>
  )
}

const CHANNELS = ['linkedin', 'google_search', 'google_display', 'meta', 'email']
const GOALS = ['awareness', 'leads', 'pipeline', 'retention']

function ArchitectSetupInput({
  workspaceId,
  onSubmit,
}: {
  workspaceId: string
  onSubmit: (goal: string, channels: string[]) => void
}) {
  const [goal, setGoal] = useState('leads')
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['linkedin'])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latestSignalId = useAgentStore((s) => s.latestSignalId)

  function toggleChannel(ch: string) {
    setSelectedChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (selectedChannels.length === 0) return
    setLoading(true)
    setError(null)
    try {
      await api.agents.runArchitect(workspaceId, {
        market_signal_id: latestSignalId ?? undefined,
        campaign_goal: goal,
        channels: selectedChannels,
      })
      onSubmit(goal, selectedChannels)
    } catch (err) {
      setError(String(err))
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <p className="text-[10px] text-[#8B949E] mb-1.5">Campaign goal</p>
        <div className="flex flex-wrap gap-1.5">
          {GOALS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGoal(g)}
              className={[
                'px-2.5 py-1 text-xs rounded-md capitalize transition-colors',
                goal === g
                  ? 'bg-[#2D7DD2] text-white'
                  : 'bg-[#21262D] text-[#8B949E] hover:text-[#E6EDF3]',
              ].join(' ')}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[10px] text-[#8B949E] mb-1.5">Channels</p>
        <div className="flex flex-wrap gap-1.5">
          {CHANNELS.map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => toggleChannel(ch)}
              className={[
                'px-2.5 py-1 text-xs rounded-md capitalize transition-colors',
                selectedChannels.includes(ch)
                  ? 'bg-[#238636] text-white'
                  : 'bg-[#21262D] text-[#8B949E] hover:text-[#E6EDF3]',
              ].join(' ')}
            >
              {ch.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-[#F85149]">{error}</p>}
      <button
        type="submit"
        disabled={loading || selectedChannels.length === 0}
        className="w-full py-2 text-xs font-medium rounded-lg bg-[#238636] text-white hover:bg-[#2EA043] disabled:opacity-40 transition-colors"
      >
        {loading ? 'Launching Architect Agent…' : 'Build Campaign Playbook'}
      </button>
    </form>
  )
}

function FreeTextInput({ onSend }: { onSend: (text: string) => void }) {
  const [value, setValue] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const v = value.trim()
    if (!v) return
    onSend(v)
    setValue('')
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const v = value.trim()
      if (v) {
        onSend(v)
        setValue('')
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <textarea
        rows={1}
        placeholder="Message Vimi…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        className="flex-1 px-3 py-2 text-xs rounded-lg bg-[#0D1117] border border-[#30363D] text-[#E6EDF3] placeholder-[#484F58] focus:outline-none focus:border-[#388BFD] resize-none"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="px-3 py-2 text-xs font-medium rounded-lg bg-[#21262D] text-[#E6EDF3] hover:bg-[#30363D] disabled:opacity-40 transition-colors shrink-0"
      >
        Send
      </button>
    </form>
  )
}

function AgentSpinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#161B22] border border-[#30363D]">
      <span className="inline-block h-3 w-3 rounded-full border-2 border-[#388BFD] border-t-transparent animate-spin" />
      <span className="text-xs text-[#8B949E]">{label}</span>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function VimiChatPanel({ workspaceId }: { workspaceId: string }) {
  const { phase, messages, setPhase, addMessage } = useChatStore()
  const { setLatestSignalId } = useAgentStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Send Vimi's opening message when phase changes (if not already sent for this phase)
  const sentPhaseGreetings = useRef<Set<ChatPhase>>(new Set())
  useEffect(() => {
    const greeting = PHASE_GREETINGS[phase]
    if (greeting && !sentPhaseGreetings.current.has(phase)) {
      sentPhaseGreetings.current.add(phase)
      addMessage('vimi', greeting)
    }
  }, [phase, addMessage])

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  function handleUserMessage(text: string) {
    addMessage('user', text)
    // Simple keyword routing for ACTIVE phase
    const lower = text.toLowerCase()
    if (lower.includes('intel') || lower.includes('competitor')) {
      addMessage('vimi', "To run a new Intel analysis, I'll need competitor URLs and keywords. Switch to the Intel Setup below or type the URLs here.")
    } else if (lower.includes('playbook') || lower.includes('architect')) {
      addMessage('vimi', "To generate a new Campaign Playbook, I need to know the campaign goal and target channels. Use the Architect Setup below.")
    } else if (lower.includes('vault') || lower.includes('document')) {
      addMessage('vimi', "You can add documents to the Brand Voice Vault using the Vault tab in Mission Control on the right.")
    } else {
      addMessage('vimi', "Got it. Is there anything specific you'd like to adjust — campaign goal, channels, or competitor list?")
    }
  }

  function handleIntelSubmit(urls: string[], _keywords: string) {
    addMessage('user', `Running Intel Agent on: ${urls.join(', ')}`)
    addMessage('vimi', "Intel Agent launched. I'll update you when the Market Signal is ready — watch the status in Mission Control.")
    setPhase('INTEL_RUNNING')
  }

  async function handleArchitectSubmit(goal: string, channels: string[]) {
    addMessage('user', `Campaign goal: ${goal} · Channels: ${channels.join(', ')}`)
    addMessage('vimi', "Architect Agent launched. Combining your Brand Voice Vault with the Market Signal now.")
    setPhase('ARCHITECT_RUNNING')

    // Fetch latest signal to store its ID for the next run
    try {
      const signals = await api.outputs.listSignals(workspaceId) as Array<{ id: string }>
      if (signals.length > 0) {
        setLatestSignalId(signals[0].id)
      }
    } catch {
      // non-fatal
    }
  }

  const renderInput = () => {
    switch (phase) {
      case 'INTEL_SETUP':
        return (
          <IntelSetupInput workspaceId={workspaceId} onSubmit={handleIntelSubmit} />
        )
      case 'INTEL_RUNNING':
        return <AgentSpinner label="Intel Agent running…" />
      case 'ARCHITECT_SETUP':
        return (
          <ArchitectSetupInput workspaceId={workspaceId} onSubmit={handleArchitectSubmit} />
        )
      case 'ARCHITECT_RUNNING':
        return <AgentSpinner label="Architect Agent generating your playbook…" />
      default:
        return <FreeTextInput onSend={handleUserMessage} />
    }
  }

  // Quick-action buttons for WELCOME and VAULT_COMPLETE phases
  const quickActions: { label: string; action: () => void }[] = (() => {
    if (phase === 'WELCOME' || phase === 'VAULT_INTRO' || phase === 'VAULT_COMPLETE') {
      return [
        {
          label: 'Start Intel Analysis',
          action: () => {
            addMessage('user', 'Start competitor analysis')
            setPhase('INTEL_SETUP')
          },
        },
      ]
    }
    if (phase === 'ACTIVE') {
      return [
        {
          label: 'Run new Intel',
          action: () => {
            addMessage('user', 'Run new Intel analysis')
            setPhase('INTEL_SETUP')
          },
        },
        {
          label: 'New Playbook',
          action: () => {
            addMessage('user', 'Create new campaign playbook')
            setPhase('ARCHITECT_SETUP')
          },
        },
      ]
    }
    return []
  })()

  return (
    <div className="flex flex-col h-full bg-[#0D1117]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3.5 border-b border-[#30363D] shrink-0">
        <div className="h-7 w-7 rounded-full bg-[#2D7DD2] flex items-center justify-center text-xs font-bold text-white">
          V
        </div>
        <div>
          <p className="text-sm font-semibold text-[#E6EDF3]">Vimi</p>
          <p className="text-[10px] text-[#8B949E] capitalize">
            {phase.replace(/_/g, ' ').toLowerCase()}
          </p>
        </div>
      </div>

      {/* Message thread */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
      >
        {messages.length === 0 && (
          <p className="text-xs text-[#484F58] text-center mt-8">
            Vimi is ready.
          </p>
        )}
        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}
      </div>

      {/* Input area */}
      <div className="px-4 py-3 border-t border-[#30363D] space-y-2 shrink-0">
        {/* Quick actions */}
        {quickActions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {quickActions.map((qa) => (
              <button
                key={qa.label}
                onClick={qa.action}
                className="px-2.5 py-1 text-[10px] font-medium rounded-md bg-[#161B22] border border-[#30363D] text-[#8B949E] hover:text-[#E6EDF3] hover:border-[#388BFD] transition-colors"
              >
                {qa.label}
              </button>
            ))}
          </div>
        )}
        {renderInput()}
      </div>
    </div>
  )
}
