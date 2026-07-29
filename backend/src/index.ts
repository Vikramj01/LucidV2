import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { healthRouter } from './routes/health'
import { organisationsRouter } from './routes/organisations'
import { workspacesRouter } from './routes/workspaces'
import { vaultRouter } from './routes/vault'
import { uploadRouter } from './routes/upload'
import { agentsRouter } from './routes/agents'
import { integrationsRouter } from './routes/integrations'
import { integrationsOAuthRouter } from './routes/integrationsOAuth'
import { projectsRouter } from './routes/projects'
import { campaignsRouter } from './routes/campaigns'
import { projectAgentsRouter } from './routes/projectAgents'
import { campaignAgentsRouter } from './routes/campaignAgents'
import { projectOutputsRouter } from './routes/projectOutputs'
import { campaignOutputsRouter } from './routes/campaignOutputs'
import { internalRouter } from './routes/internal'
import { adminRouter } from './routes/admin'
import { errorHandler } from './middleware/error'

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(helmet())
app.use(cors())
app.use(express.json())

// Public routes
app.use('/api', healthRouter)

// Authenticated routes
app.use('/api/organisations', organisationsRouter)
app.use('/api/workspaces', workspacesRouter)
app.use('/api/workspaces/:id/vault', vaultRouter)
app.use('/api/workspaces/:id/vault', uploadRouter)
app.use('/api/workspaces/:id/agents', agentsRouter)
app.use('/api/workspaces/:id/integrations', integrationsRouter)

// Project/Campaign-scoped routes. Mounted most-specific-first: several of
// these routers apply their auth/scope checks as blanket router-level
// middleware (see projectOutputsRouter, campaignOutputsRouter), which
// would otherwise run redundantly for requests actually destined for a
// deeper, more specific router before falling through to it.
app.use('/api/workspaces/:id/projects/:projectId/campaigns/:campaignId/agents', campaignAgentsRouter)
app.use('/api/workspaces/:id/projects/:projectId/campaigns/:campaignId', campaignOutputsRouter)
app.use('/api/workspaces/:id/projects/:projectId/campaigns', campaignsRouter)
app.use('/api/workspaces/:id/projects/:projectId/agents', projectAgentsRouter)
app.use('/api/workspaces/:id/projects/:projectId', projectOutputsRouter)
app.use('/api/workspaces/:id/projects', projectsRouter)

// Fixed-path routes — OAuth redirect URIs must be static, and internal
// routes aren't nested under any one workspace.
app.use('/api/integrations', integrationsOAuthRouter)
app.use('/api/internal', internalRouter)

app.use('/api/admin', adminRouter)

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' })
})

// Global error handler — must be last
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`)
})

export default app
