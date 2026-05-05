import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!

export interface AuthedRequest extends Request {
  user: {
    id: string
    email: string
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header', code: 'AUTH_MISSING' })
    return
  }

  const token = authHeader.slice(7)

  // Validate JWT via Supabase — never use jwt.verify() directly
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })

  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    res.status(401).json({ error: 'Invalid or expired token', code: 'AUTH_INVALID' })
    return
  }

  ;(req as AuthedRequest).user = {
    id: data.user.id,
    email: data.user.email ?? '',
  }

  next()
}
