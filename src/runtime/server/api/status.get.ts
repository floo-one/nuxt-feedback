import { defineEventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from '#imports'
import { fetchIssueState, parseIssueNumbers } from '../lib/github'
import type { FeedbackStatus, PrivateFeedbackConfig } from '../../types'

/**
 * Refresh the open/closed state of issues the client says it filed.
 *
 * `GET /api/__feedback/status?numbers=1,2,3` → `[{ number, state }]`.
 *
 * Returns ONLY `{ number, state }` — never a title or body. The client already
 * has the title locally, so the server never echoes issue content back, which
 * stops a client from enumerating issue numbers to read issues it didn't file.
 * Unknown/deleted issues are simply omitted. Never throws to the client: a
 * missing token or a GitHub outage yields `[]`, and the drawer keeps showing its
 * last-known states.
 */
export default defineEventHandler(async (event): Promise<FeedbackStatus[]> => {
  const config = useRuntimeConfig(event)
  const feedback = config.feedback as PrivateFeedbackConfig
  const token = config.githubToken as string
  const repo = feedback?.github?.repo

  const numbers = parseIssueNumbers(getQuery(event).numbers)
  if (!repo || !token || numbers.length === 0) {
    return []
  }

  const results = await Promise.all(
    numbers.map(n => fetchIssueState(repo, token, n)),
  )
  return results.filter((r): r is FeedbackStatus => r !== null)
})
