import { Router, Request, Response } from 'express'
import { requireAuth, AuthedRequest } from '../middleware/auth'
import { supabase } from '../lib/supabase'

export const adminRouter = Router()

async function requireSuperAdmin(req: Request, res: Response): Promise<boolean> {
  const { user } = req as AuthedRequest
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'super_admin') {
    res.status(403).json({ error: 'Super admin access required', code: 'FORBIDDEN' })
    return false
  }
  return true
}

// GET /api/admin/stats
adminRouter.get('/stats', requireAuth, async (req: Request, res: Response) => {
  if (!(await requireSuperAdmin(req, res))) return

  const [orgsResult, usersResult, runsResult, creditsResult] = await Promise.all([
    supabase.from('organisations').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('agent_runs').select('id', { count: 'exact', head: true }),
    supabase.from('credit_ledger').select('credits_used'),
  ])

  const totalCreditsUsed = (creditsResult.data ?? []).reduce(
    (sum, row) => sum + (row.credits_used ?? 0),
    0
  )

  res.json({
    total_organisations: orgsResult.count ?? 0,
    total_users: usersResult.count ?? 0,
    total_agent_runs: runsResult.count ?? 0,
    total_credits_used: totalCreditsUsed,
  })
})

// GET /api/admin/organisations
adminRouter.get('/organisations', requireAuth, async (req: Request, res: Response) => {
  if (!(await requireSuperAdmin(req, res))) return

  const { data, error } = await supabase
    .from('organisations')
    .select('*, workspaces(id)')
    .order('created_at', { ascending: false })

  if (error) {
    res.status(500).json({ error: 'Failed to list organisations', code: 'DB_ERROR' })
    return
  }

  res.json(data)
})

// GET /api/admin/users
adminRouter.get('/users', requireAuth, async (req: Request, res: Response) => {
  if (!(await requireSuperAdmin(req, res))) return

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    res.status(500).json({ error: 'Failed to list users', code: 'DB_ERROR' })
    return
  }

  res.json(data)
})
