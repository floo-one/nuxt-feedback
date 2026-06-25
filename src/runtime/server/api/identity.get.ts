import { defineEventHandler } from 'h3'
import resolveUser from '#feedback/resolve-user'
import type { FeedbackIdentity } from '../../types'

/**
 * Tells the client whether the current user is known (via the host's resolveUser
 * hook). Returns only a boolean — never the user's data — so the dialog can decide
 * whether to ask for an email. resolveUser must never throw; we treat errors as
 * "not identified".
 */
export default defineEventHandler(async (event): Promise<FeedbackIdentity> => {
  const user = await resolveUser(event).catch(() => null)
  return { identified: !!user }
})
