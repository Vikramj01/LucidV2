'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding` },
    })
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/onboarding` },
    })
  }

  return (
    <div className="min-h-screen bg-[#0D1117] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-[#E6EDF3]">Get started with Lucid</h1>
          <p className="mt-2 text-sm text-[#8B949E]">Create your account to meet Vimi</p>
        </div>

        {sent ? (
          <div className="rounded-lg border border-[#30363D] bg-[#161B22] p-6 text-center">
            <p className="text-[#E6EDF3]">Check your email</p>
            <p className="mt-2 text-sm text-[#8B949E]">
              We sent a magic link to <span className="text-[#2D7DD2]">{email}</span>
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-[#30363D] bg-[#161B22] p-6 space-y-4">
            <form onSubmit={handleSignup} className="space-y-3">
              <div>
                <label htmlFor="email" className="block text-sm text-[#8B949E] mb-1">
                  Work email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full rounded-md border border-[#30363D] bg-[#1C2128] px-3 py-2 text-sm text-[#E6EDF3] placeholder-[#484F58] focus:border-[#2D7DD2] focus:outline-none"
                />
              </div>
              {error && <p className="text-xs text-[#F85149]">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-[#2D7DD2] px-4 py-2 text-sm font-medium text-white hover:bg-[#2D7DD2]/90 disabled:opacity-50"
              >
                {loading ? 'Sending…' : 'Send magic link'}
              </button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#30363D]" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-[#161B22] px-2 text-[#484F58]">or</span>
              </div>
            </div>

            <button
              onClick={handleGoogle}
              className="w-full rounded-md border border-[#30363D] bg-[#1C2128] px-4 py-2 text-sm text-[#E6EDF3] hover:border-[#2D7DD2] transition-colors"
            >
              Continue with Google
            </button>
          </div>
        )}

        <p className="mt-4 text-center text-xs text-[#484F58]">
          Already have an account?{' '}
          <Link href="/login" className="text-[#2D7DD2] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
