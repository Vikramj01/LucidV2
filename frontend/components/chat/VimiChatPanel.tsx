'use client'

import { useEffect, useRef, useState } from 'react'
import { useChatStore, ChatPhase } from '@/store/chat'
import { useWorkspaceStore } from '@/store/workspace'
import { api } from '@/lib/api'
import { ChatBubble } from './ChatBubble'

// ── Phase scripts ─────────────────────────────────────────────────────────────
// Vimi's opening message for each phase

const PHASE_GREETINGS: Partial<Record<ChatPhase, string>> = {
  WELCOME:
    "Hi, I'm Vimi — your marketing strategist. Your workspace is ready. Let's build your Brand Voice Vault first so I understand your brand before we research your market. Add a brand document to get started.",
  VAULT_INTRO:
    "Time to build your Brand Voice Vault. Add PDFs, URLs, or paste text from your brand guidelines, website, or previous campaigns. The more context I have, the sharper your playbooks will be.",
  VAULT_COMPLETE:
    "Your vault is building. Once the documents are processed, we'll move on to competitor analysis. You can also add more documents any time from the Vault tab.",
  RESEARCH_SETUP:
    "Let's research your market. Research lives in a project, so every campaign in that project can reuse it. Give me up to 5 competitor URLs, a few industry keywords, and any questions you want answered, and I'll produce a Research Signal with gaps and positioning angles.",
  RESEARCH_RUNNING:
    "Research Agent is running — scraping competitors and comparing them. This usually takes a minute or two. I'll let you know when it's done.",
  ARCHITECT_SETUP:
    "Research is ready. Now let's create a campaign and build its playbook. What's the campaign goal and which channels are you targeting?",
  ARCHITECT_RUNNING:
    "Architect Agent is running — combining your Brand Voice Vault with the project's research to generate your Campaign Playbook. Almost there.",
  ACTIVE:
    "Your Campaign Playbook is ready in Mission Control. Review and approve it when you're happy. I'm here if you want to adjust the brief or run a new analysis.",
}

// ── Phase input components ────────────────────────────────────────────────────

function ResearchSetupInput({
  workspaceId,
  onSubmit,
}: {
  workspaceId: string
  onSubmit: (projectName: string, urls: string[]) => void
}) {
  const projectId = useWorkspaceStore((s) => s.projectId)
  const projectName = useWorkspaceStore((s) => s.projectName)
  const setProject = useWorkspaceStore((s) => s.setProject)
  const [newProjectName, setNewProjectName] = useState('')
  const [urls, setUrls] = useState('')
  const [keywords, setKeywords] = useState('')
  const [questions, setQuestions] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lines = (text: string) =>
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const urlList = lines(urls)
    if (urlList.length === 0) return
    if (!projectId && !newProjectName.trim()) return
    setLoading(true)
    setError(null)
    try {
      // Research belongs to a Project; create one on first run
      let project = projectId ? { id: projectId, name: projectName ?? '' } : null
      if (!project) {
        project = await api.projects.create(workspaceId, { name: newProjectName.trim() })
        setProject(project)
      }
      await api.projects.runResearch(workspaceId, project.id, {
        competitor_urls: urlList,
        industry_keywords: keywords.trim(),
        research_questions: lines(questions),
      })
      onSubmit(project.name, urlList)
    } catch (err) {
      setError(String(err))
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {projectId ? (
        <p className="text-[10px] text-[#8B949E]">
          Project: <span className="text-[#E6EDF3]">{projectName}</span>
        </p>
      ) : (
        <input
          type="text"
          placeholder="Project name (e.g. Q3 EU Expansion)"
          value={newProjectName}
          onChange={(e) => setNewProjectName(e.target.value)}
          className="w-full px-3 py-2 text-xs rounded-lg bg-[#0D1117] border border-[#30363D] text-[#E6EDF3] placeholder-[#484F58] focus:outline-none focus:border-[#388BFD]"
        />
      )}
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
        placeholder={"Research questions (optional, one per line)\nWhat's driving budget consolidation in this category?"}
        value={questions}
        onChange={(e) => setQuestions(e.target.value)}
        rows={2}
        className="w-full px-3 py-2 text-xs rounded-lg bg-[#0D1117] border border-[#30363D] text-[#E6EDF3] placeholder-[#484F58] focus:outline-none focus:border-[#388BFD] resize-none"
      />
      {error && <p className="text-xs text-[#F85149]">{error}</p>}
      <button
        type="submit"
        disabled={loading || !urls.trim() || (!projectId && !newProjectName.trim())}
        className="w-full py-2 text-xs font-medium rounded-lg bg-[#2D7DD2] text-white hover:bg-[#388BFD] disabled:opacity-40 transition-colors"
      >
        {loading ? 'Launching Research Agent…' : 'Run Research Agent'}
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
  onSubmit: (campaignName: string, goal: string, channels: string[]) => void
}) {
  const projectId = useWorkspaceStore((s) => s.projectId)
  const setCampaign = useWorkspaceStore((s) => s.setCampaign)
  const [campaignName, setCampaignName] = useState('')
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
    if (selectedChannels.length === 0 || !campaignName.trim()) return
    setLoading(true)
    setError(null)
    try {
      if (!projectId) throw new Error('Run research for a project first')
      const campaign = await api.campaigns.create(workspaceId, projectId, {
        name: campaignName.trim(),
        campaign_goal: goal,
        channels: selectedChannels,
      })
      setCampaign(campaign)
      // No research_signal_id: the Architect uses the project's latest research
      await api.campaigns.runArchitect(workspaceId, projectId, campaign.id)
      onSubmit(campaign.name, goal, selectedChannels)
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
        value={campaignName}
        onChange={(e) => setCampaignName(e.target.value)}
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
        disabled={loading || selectedChannels.length === 0 || !campaignName.trim()}
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
  const setProject = useWorkspaceStore((s) => s.setProject)
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
    if (lower.includes('research') || lower.includes('competitor')) {
      addMessage('vimi', "To run new research, I'll need competitor URLs and keywords. Use the \"Run new research\" action below.")
    } else if (lower.includes('playbook') || lower.includes('architect')) {
      addMessage('vimi', "To generate a new Campaign Playbook, I need to know the campaign goal and target channels. Use the Architect Setup below.")
    } else if (lower.includes('vault') || lower.includes('document')) {
      addMessage('vimi', "You can add documents to the Brand Voice Vault using the Vault tab in Mission Control on the right.")
    } else {
      addMessage('vimi', "Got it. Is there anything specific you'd like to adjust — campaign goal, channels, or competitor list?")
    }
  }

  function handleResearchSubmit(projectName: string, urls: string[]) {
    addMessage('user', `Research for ${projectName}: ${urls.join(', ')}`)
    addMessage('vimi', "Research Agent launched. I'll update you when the Research Signal is ready — watch the status in Mission Control.")
    setPhase('RESEARCH_RUNNING')
  }

  function handleArchitectSubmit(campaignName: string, goal: string, channels: string[]) {
    addMessage('user', `${campaignName} · Goal: ${goal} · Channels: ${channels.join(', ')}`)
    addMessage('vimi', "Architect Agent launched. Combining your Brand Voice Vault with the project's research now.")
    setPhase('ARCHITECT_RUNNING')
  }

  const renderInput = () => {
    switch (phase) {
      case 'RESEARCH_SETUP':
        return (
          <ResearchSetupInput workspaceId={workspaceId} onSubmit={handleResearchSubmit} />
        )
      case 'RESEARCH_RUNNING':
        return <AgentSpinner label="Research Agent running…" />
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
          label: 'Start Research',
          action: () => {
            addMessage('user', 'Start competitor research')
            setPhase('RESEARCH_SETUP')
          },
        },
      ]
    }
    if (phase === 'ACTIVE') {
      return [
        {
          label: 'Run new research',
          action: () => {
            addMessage('user', 'Run new research')
            setPhase('RESEARCH_SETUP')
          },
        },
        {
          label: 'New project',
          action: () => {
            addMessage('user', 'Start a new project')
            setProject(null)
            setPhase('RESEARCH_SETUP')
          },
        },
        {
          label: 'New campaign',
          action: () => {
            addMessage('user', 'Create a new campaign in this project')
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
