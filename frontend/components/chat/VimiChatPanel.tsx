'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useChatStore, ChatPhase } from '@/store/chat'
import { useProjectStore } from '@/store/project'
import { api } from '@/lib/api'
import { ChatBubble } from './ChatBubble'

// ── Phase scripts ─────────────────────────────────────────────────────────────
// Vimi's opening message for each phase

const PHASE_GREETINGS: Partial<Record<ChatPhase, string>> = {
  WELCOME:
    "Hi, I'm Vimi — your AI marketing strategist. Your workspace is ready. Let's build your Brand Voice Vault first so I understand your brand before we start researching. Add a brand document to get started.",
  VAULT_INTRO:
    "Time to build your Brand Voice Vault. Add PDFs, URLs, connected Drive/Notion documents, or paste text from your brand guidelines, website, or previous campaigns. The more context I have, the sharper your playbooks will be.",
  VAULT_COMPLETE:
    "Your vault is building. Once the documents are processed, let's start a Project — the container for research that gets reused across every campaign you run under it.",
  PROJECT_CREATE:
    "What initiative should this Project cover? Give it a name — e.g. \"Q3 EU Expansion\" or \"Enterprise Tier Launch\".",
  RESEARCH_SETUP:
    "Let's run market research for this project. Give me up to 5 competitor URLs, a few industry keywords, and — optionally — any specific questions you want answered. I'll produce a structured Research Signal with gaps and positioning angles.",
  RESEARCH_RUNNING:
    "Research Agent is running — scraping competitors and extracting insights. This usually takes 30–60 seconds. I'll let you know when it's done.",
  ICP_SETUP:
    "Research is ready. Want me to build an Ideal Customer Profile from it? This is reusable across every campaign in this project.",
  ICP_RUNNING:
    "ICP Agent is running — synthesising firmographics and buyer personas from your research and brand vault.",
  MARKET_SIZING_SETUP:
    "Want me to size the market too? I'll estimate TAM/SAM/SOM. You can optionally give me a few market-data or analyst-report URLs to ground the estimate — or skip this.",
  MARKET_SIZING_RUNNING:
    "Market Sizing Agent is running — estimating TAM/SAM/SOM from your research (and any sources you gave me).",
  CAMPAIGN_CREATE:
    "Project intelligence is ready. Let's build a Campaign — give it a name, a goal, and the channels you're targeting, and I'll generate the playbook immediately.",
  ARCHITECT_SETUP:
    "Ready to (re-)generate the Campaign Playbook for this campaign using the latest project intelligence and brand vault.",
  ARCHITECT_RUNNING:
    "Architect Agent is running — combining your Brand Voice Vault with the project's research, ICP, and market sizing to generate your Campaign Playbook. Almost there.",
  ACTIVE:
    "Your Campaign Playbook is ready in Mission Control. Review and approve it when you're happy. I'm here if you want to start a new campaign, refresh the research, or switch projects.",
}

// ── Phase input components ────────────────────────────────────────────────────

function ProjectCreateInput({
  workspaceId,
  onCreated,
}: {
  workspaceId: string
  onCreated: (project: { id: string; name: string }) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError(null)
    try {
      const project = await api.projects.create(workspaceId, {
        name: name.trim(),
        description: description.trim() || undefined,
      })
      onCreated({ id: project.id, name: project.name })
    } catch (err) {
      setError(String(err))
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <input
        type="text"
        placeholder="Project name (e.g. Q3 EU Expansion)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-3 py-2 text-xs rounded-lg bg-[#0D1117] border border-[#30363D] text-[#E6EDF3] placeholder-[#484F58] focus:outline-none focus:border-[#388BFD]"
      />
      <input
        type="text"
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full px-3 py-2 text-xs rounded-lg bg-[#0D1117] border border-[#30363D] text-[#E6EDF3] placeholder-[#484F58] focus:outline-none focus:border-[#388BFD]"
      />
      {error && <p className="text-xs text-[#F85149]">{error}</p>}
      <button
        type="submit"
        disabled={loading || !name.trim()}
        className="w-full py-2 text-xs font-medium rounded-lg bg-[#2D7DD2] text-white hover:bg-[#388BFD] disabled:opacity-40 transition-colors"
      >
        {loading ? 'Creating project…' : 'Create Project'}
      </button>
    </form>
  )
}

function ResearchSetupInput({
  workspaceId,
  projectId,
  onSubmit,
}: {
  workspaceId: string
  projectId: string
  onSubmit: (urls: string[], keywords: string) => void
}) {
  const [urls, setUrls] = useState('')
  const [keywords, setKeywords] = useState('')
  const [questions, setQuestions] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const urlList = urls.split('\n').map((u) => u.trim()).filter(Boolean)
    const questionList = questions.split('\n').map((q) => q.trim()).filter(Boolean)
    if (urlList.length === 0) return
    setLoading(true)
    setError(null)
    try {
      await api.agents.runResearch(workspaceId, projectId, {
        competitor_urls: urlList,
        industry_keywords: keywords.trim(),
        research_questions: questionList,
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
      <textarea
        placeholder={"Anything specific you want answered? (optional, one per line)"}
        value={questions}
        onChange={(e) => setQuestions(e.target.value)}
        rows={2}
        className="w-full px-3 py-2 text-xs rounded-lg bg-[#0D1117] border border-[#30363D] text-[#E6EDF3] placeholder-[#484F58] focus:outline-none focus:border-[#388BFD] resize-none"
      />
      {error && <p className="text-xs text-[#F85149]">{error}</p>}
      <button
        type="submit"
        disabled={loading || !urls.trim()}
        className="w-full py-2 text-xs font-medium rounded-lg bg-[#2D7DD2] text-white hover:bg-[#388BFD] disabled:opacity-40 transition-colors"
      >
        {loading ? 'Launching Research Agent…' : 'Run Research Agent'}
      </button>
    </form>
  )
}

function SkippableAgentInput({
  runLabel,
  runningLabel,
  onRun,
  onSkip,
  extra,
}: {
  runLabel: string
  runningLabel: string
  onRun: () => Promise<void>
  onSkip: () => void
  extra?: React.ReactNode
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRun() {
    setLoading(true)
    setError(null)
    try {
      await onRun()
    } catch (err) {
      setError(String(err))
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      {extra}
      {error && <p className="text-xs text-[#F85149]">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleRun}
          disabled={loading}
          className="flex-1 py-2 text-xs font-medium rounded-lg bg-[#2D7DD2] text-white hover:bg-[#388BFD] disabled:opacity-40 transition-colors"
        >
          {loading ? runningLabel : runLabel}
        </button>
        <button
          onClick={onSkip}
          disabled={loading}
          className="px-3 py-2 text-xs font-medium rounded-lg bg-[#21262D] text-[#8B949E] hover:text-[#E6EDF3] disabled:opacity-40 transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  )
}

function IcpSetupInput({
  workspaceId,
  projectId,
  onRun,
  onSkip,
}: {
  workspaceId: string
  projectId: string
  onRun: () => void
  onSkip: () => void
}) {
  return (
    <SkippableAgentInput
      runLabel="Build ICP Profile"
      runningLabel="Launching ICP Agent…"
      onSkip={onSkip}
      onRun={async () => {
        await api.agents.runIcp(workspaceId, projectId, {})
        onRun()
      }}
    />
  )
}

function MarketSizingSetupInput({
  workspaceId,
  projectId,
  onRun,
  onSkip,
}: {
  workspaceId: string
  projectId: string
  onRun: () => void
  onSkip: () => void
}) {
  const [urls, setUrls] = useState('')

  return (
    <SkippableAgentInput
      runLabel="Run Market Sizing"
      runningLabel="Launching Market Sizing Agent…"
      onSkip={onSkip}
      extra={
        <textarea
          placeholder="Analyst report or market-data URLs (optional, one per line)"
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 text-xs rounded-lg bg-[#0D1117] border border-[#30363D] text-[#E6EDF3] placeholder-[#484F58] focus:outline-none focus:border-[#388BFD] resize-none"
        />
      }
      onRun={async () => {
        const urlList = urls.split('\n').map((u) => u.trim()).filter(Boolean)
        await api.agents.runMarketSizing(workspaceId, projectId, { market_data_urls: urlList })
        onRun()
      }}
    />
  )
}

const CHANNELS = ['linkedin', 'google_search', 'google_display', 'meta', 'email']
const GOALS = ['awareness', 'leads', 'pipeline', 'retention']

function CampaignCreateInput({
  workspaceId,
  projectId,
  onCreated,
}: {
  workspaceId: string
  projectId: string
  onCreated: (campaign: { id: string; name: string }) => void
}) {
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('leads')
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['linkedin'])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleChannel(ch: string) {
    setSelectedChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || selectedChannels.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const campaign = await api.campaigns.create(workspaceId, projectId, {
        name: name.trim(),
        campaign_goal: goal,
        channels: selectedChannels,
      })
      await api.agents.runArchitect(workspaceId, projectId, campaign.id, {})
      onCreated({ id: campaign.id, name: campaign.name })
    } catch (err) {
      setError(String(err))
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="text"
        placeholder="Campaign name (e.g. LinkedIn ABM Push)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-3 py-2 text-xs rounded-lg bg-[#0D1117] border border-[#30363D] text-[#E6EDF3] placeholder-[#484F58] focus:outline-none focus:border-[#388BFD]"
      />

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
        disabled={loading || !name.trim() || selectedChannels.length === 0}
        className="w-full py-2 text-xs font-medium rounded-lg bg-[#238636] text-white hover:bg-[#2EA043] disabled:opacity-40 transition-colors"
      >
        {loading ? 'Creating campaign & launching Architect…' : 'Create Campaign & Build Playbook'}
      </button>
    </form>
  )
}

function ArchitectSetupInput({
  workspaceId,
  projectId,
  campaignId,
  onSubmit,
}: {
  workspaceId: string
  projectId: string
  campaignId: string
  onSubmit: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRun() {
    setLoading(true)
    setError(null)
    try {
      await api.agents.runArchitect(workspaceId, projectId, campaignId, {})
      onSubmit()
    } catch (err) {
      setError(String(err))
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-[#F85149]">{error}</p>}
      <button
        onClick={handleRun}
        disabled={loading}
        className="w-full py-2 text-xs font-medium rounded-lg bg-[#238636] text-white hover:bg-[#2EA043] disabled:opacity-40 transition-colors"
      >
        {loading ? 'Launching Architect Agent…' : 'Run Architect Agent'}
      </button>
    </div>
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

export function VimiChatPanel({
  workspaceId,
  projectId,
  campaignId,
}: {
  workspaceId: string
  projectId: string | null
  campaignId: string | null
}) {
  const { phase, messages, setPhase, addMessage } = useChatStore()
  const { setProject, setCampaign } = useProjectStore()
  const router = useRouter()
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
    const lower = text.toLowerCase()
    if (lower.includes('research') || lower.includes('competitor')) {
      addMessage('vimi', "To run new research, I'll need competitor URLs and keywords. Use the Research Setup below or ask me to switch to it.")
    } else if (lower.includes('playbook') || lower.includes('architect') || lower.includes('campaign')) {
      addMessage('vimi', "To build a new campaign playbook, start a new Campaign — I'll need a name, goal, and channels.")
    } else if (lower.includes('vault') || lower.includes('document')) {
      addMessage('vimi', "You can add documents to the Brand Voice Vault using the Vault tab in Mission Control on the right.")
    } else {
      addMessage('vimi', "Got it. Is there anything specific you'd like to adjust — project, campaign goal, channels, or research inputs?")
    }
  }

  function handleProjectCreated(project: { id: string; name: string }) {
    addMessage('user', `Create project: ${project.name}`)
    addMessage('vimi', `Project "${project.name}" created. Let's run research for it.`)
    setProject(project)
    setPhase('RESEARCH_SETUP')
    router.push(`/dashboard/${workspaceId}/projects/${project.id}`)
  }

  function handleResearchSubmit(urls: string[]) {
    addMessage('user', `Running Research Agent on: ${urls.join(', ')}`)
    addMessage('vimi', "Research Agent launched. I'll update you when the Research Signal is ready — watch the status in Mission Control.")
    setPhase('RESEARCH_RUNNING')
  }

  function handleIcpRun() {
    addMessage('user', 'Build ICP profile')
    addMessage('vimi', "ICP Agent launched — synthesising firmographics and buyer personas.")
    setPhase('ICP_RUNNING')
  }

  function handleIcpSkip() {
    addMessage('user', 'Skip ICP')
    setPhase('MARKET_SIZING_SETUP')
  }

  function handleMarketSizingRun() {
    addMessage('user', 'Run market sizing')
    addMessage('vimi', "Market Sizing Agent launched — estimating TAM/SAM/SOM.")
    setPhase('MARKET_SIZING_RUNNING')
  }

  function handleMarketSizingSkip() {
    addMessage('user', 'Skip market sizing')
    setPhase('CAMPAIGN_CREATE')
  }

  function handleCampaignCreated(campaign: { id: string; name: string }) {
    if (!projectId) return
    addMessage('user', `Create campaign: ${campaign.name}`)
    addMessage('vimi', "Campaign created. Architect Agent launched — combining your project intelligence with the Brand Voice Vault.")
    setCampaign(campaign)
    setPhase('ARCHITECT_RUNNING')
    router.push(`/dashboard/${workspaceId}/projects/${projectId}/campaigns/${campaign.id}`)
  }

  function handleArchitectRerun() {
    addMessage('user', 'Re-run Architect Agent')
    addMessage('vimi', "Architect Agent launched again with the latest project intelligence.")
    setPhase('ARCHITECT_RUNNING')
  }

  const renderInput = () => {
    switch (phase) {
      case 'PROJECT_CREATE':
        return <ProjectCreateInput workspaceId={workspaceId} onCreated={handleProjectCreated} />
      case 'RESEARCH_SETUP':
        return projectId ? (
          <ResearchSetupInput workspaceId={workspaceId} projectId={projectId} onSubmit={handleResearchSubmit} />
        ) : null
      case 'RESEARCH_RUNNING':
        return <AgentSpinner label="Research Agent running…" />
      case 'ICP_SETUP':
        return projectId ? (
          <IcpSetupInput workspaceId={workspaceId} projectId={projectId} onRun={handleIcpRun} onSkip={handleIcpSkip} />
        ) : null
      case 'ICP_RUNNING':
        return <AgentSpinner label="ICP Agent running…" />
      case 'MARKET_SIZING_SETUP':
        return projectId ? (
          <MarketSizingSetupInput
            workspaceId={workspaceId}
            projectId={projectId}
            onRun={handleMarketSizingRun}
            onSkip={handleMarketSizingSkip}
          />
        ) : null
      case 'MARKET_SIZING_RUNNING':
        return <AgentSpinner label="Market Sizing Agent running…" />
      case 'CAMPAIGN_CREATE':
        return projectId ? (
          <CampaignCreateInput workspaceId={workspaceId} projectId={projectId} onCreated={handleCampaignCreated} />
        ) : null
      case 'ARCHITECT_SETUP':
        return projectId && campaignId ? (
          <ArchitectSetupInput
            workspaceId={workspaceId}
            projectId={projectId}
            campaignId={campaignId}
            onSubmit={handleArchitectRerun}
          />
        ) : null
      case 'ARCHITECT_RUNNING':
        return <AgentSpinner label="Architect Agent generating your playbook…" />
      default:
        return <FreeTextInput onSend={handleUserMessage} />
    }
  }

  // Quick-action buttons, contextual to phase and current selection
  const quickActions: { label: string; action: () => void }[] = (() => {
    if (phase === 'WELCOME' || phase === 'VAULT_INTRO' || phase === 'VAULT_COMPLETE') {
      return [
        {
          label: 'Create Project',
          action: () => {
            addMessage('user', 'Create a new project')
            setPhase('PROJECT_CREATE')
          },
        },
      ]
    }
    if (phase === 'ACTIVE') {
      const actions: { label: string; action: () => void }[] = []
      if (projectId) {
        actions.push(
          {
            label: 'New Campaign',
            action: () => {
              addMessage('user', 'Start a new campaign in this project')
              setPhase('CAMPAIGN_CREATE')
            },
          },
          {
            label: 'Run new Research',
            action: () => {
              addMessage('user', 'Run new research')
              setPhase('RESEARCH_SETUP')
            },
          },
          {
            label: 'Run ICP',
            action: () => {
              addMessage('user', 'Run ICP')
              setPhase('ICP_SETUP')
            },
          },
          {
            label: 'Run Market Sizing',
            action: () => {
              addMessage('user', 'Run market sizing')
              setPhase('MARKET_SIZING_SETUP')
            },
          }
        )
      }
      actions.push({
        label: 'Switch / New Project',
        action: () => router.push(`/dashboard/${workspaceId}`),
      })
      return actions
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
