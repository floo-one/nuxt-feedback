/**
 * Client-side record of the reports THIS browser has filed.
 *
 * The browser is the source of truth for "what I submitted" (so the history
 * drawer reflects a report the instant it's filed, with no GitHub search lag);
 * the server status endpoint only refreshes each issue's open/closed state.
 * Per-browser by design — see the loop-back design doc.
 *
 * The pure helpers (`capSubmissions`, `applyStates`) are exported for unit tests
 * and never touch `localStorage`; the read/write functions are client-only and
 * fail closed (a broken/absent store degrades to "no history", never throws).
 */
import type { FeedbackStatus, StoredSubmission } from '../types'

const KEY = 'floo-feedback:submissions'
const MAX_ENTRIES = 50

/** Newest first, de-duplicated by issue number, capped to the most recent MAX. */
export function capSubmissions(list: StoredSubmission[]): StoredSubmission[] {
  const seen = new Set<number>()
  return [...list]
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .filter((s) => {
      if (seen.has(s.issueNumber)) return false
      seen.add(s.issueNumber)
      return true
    })
    .slice(0, MAX_ENTRIES)
}

/** Merge freshly-fetched issue states + comment counts into the stored list. */
export function applyStates(
  list: StoredSubmission[],
  states: FeedbackStatus[],
  checkedAt: string,
): StoredSubmission[] {
  const byNumber = new Map<number, FeedbackStatus>(states.map(s => [s.number, s]))
  return list.map((s) => {
    const status = byNumber.get(s.issueNumber)
    return status
      ? { ...s, state: status.state, comments: status.comments, checkedAt }
      : s
  })
}

/** True when the issue has more comments than the reporter has seen. */
export function hasUnread(s: StoredSubmission): boolean {
  return (s.comments ?? 0) > (s.seenComments ?? 0)
}

function available(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage
  }
  catch {
    return false
  }
}

/** Read the stored submissions, newest first. Never throws. */
export function readSubmissions(): StoredSubmission[] {
  if (!available()) return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Trust-but-verify: keep only entries with the shape we expect.
    const valid = parsed.filter(
      (s): s is StoredSubmission =>
        !!s && typeof s.issueNumber === 'number' && typeof s.submittedAt === 'string',
    )
    return capSubmissions(valid)
  }
  catch {
    return []
  }
}

function writeSubmissions(list: StoredSubmission[]): void {
  if (!available()) return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(capSubmissions(list)))
  }
  catch {
    // Quota / private-mode failures must never break the host app.
  }
}

/** Append (or replace by issue number) one filed report. Client-only. */
export function recordSubmission(entry: StoredSubmission): void {
  writeSubmissions([entry, ...readSubmissions()])
}

/** Refresh the stored states from the status endpoint and persist. */
export function persistStates(states: FeedbackStatus[], checkedAt: string): StoredSubmission[] {
  const next = applyStates(readSubmissions(), states, checkedAt)
  writeSubmissions(next)
  return next
}

/**
 * Mark an issue's thread as viewed up to `count` comments: sets both the known
 * and the seen comment counts to `count`, clearing the unread indicator.
 */
export function markThreadViewed(issueNumber: number, count: number): StoredSubmission[] {
  const next = readSubmissions().map(s =>
    s.issueNumber === issueNumber ? { ...s, comments: count, seenComments: count } : s,
  )
  writeSubmissions(next)
  return next
}
