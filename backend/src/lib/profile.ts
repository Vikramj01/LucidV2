import { prisma } from './prisma'

/** Fetch the caller's profile. Returns null if not found. */
export async function getProfile(userId: string) {
  return prisma.profile.findUnique({
    where: { id: userId },
    select: { id: true, role: true, orgId: true },
  })
}

/** Throw-style guard: returns profile or sends 403 and returns null. */
export async function requireOrgAdmin(userId: string, orgId: string) {
  const profile = await getProfile(userId)
  if (!profile) return null
  if (profile.role === 'super_admin') return profile
  if (profile.role === 'org_admin' && profile.orgId === orgId) return profile
  return null
}
