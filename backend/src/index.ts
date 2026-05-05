import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { healthRouter } from './routes/health'
import { organisationsRouter } from './routes/organisations'
import { workspacesRouter } from './routes/workspaces'
import { vaultRouter } from './routes/vault'
import { agentsRouter } from './routes/agents'
import { outputsRouter } from './routes/outputs'
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
app.use('/api/workspaces/:id/agents', agentsRouter)
app.use('/api/workspaces/:id', outputsRouter)
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
