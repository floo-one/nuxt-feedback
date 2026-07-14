/**
 * Shared types for @floo-one/nuxt-feedback.
 *
 * This file is imported by both client and server runtime code, so it must
 * stay free of any runtime imports (types only).
 */

export type FeedbackType = 'bug' | 'feature'

/** How badly a bug hurts. Ignored for feedback submissions. */
export type FeedbackSeverity = 'critical' | 'blocking' | 'annoying' | 'cosmetic'

/** What kind of bug it is. Only meaningful for `type: 'bug'`. */
export type FeedbackCategory = 'crash' | 'visual' | 'data' | 'performance'

export interface FeedbackContext {
  /** Page URL the feedback was sent from. */
  url?: string
  /** Browser user agent. */
  userAgent?: string
  /** Host application name (e.g. "GLE Bookings"). */
  app?: string
  /** Host build identifier (e.g. a git SHA), from `ModuleOptions.version`. */
  version?: string
  /** Bug severity picked in the dialog. Only sent for `type: 'bug'`. */
  severity?: FeedbackSeverity
  /** Bug category picked in the dialog. Only sent for `type: 'bug'`. */
  category?: FeedbackCategory
  /** Recent client-side console errors (ring buffer). Only sent for bugs. */
  consoleErrors?: string[]
  /** ISO-8601 timestamp of submission. */
  ts?: string
}

export interface FeedbackPayload {
  type: FeedbackType
  message: string
  email?: string
  context?: FeedbackContext
}

export interface FeedbackResponse {
  ok: boolean
  /** Which integration handled the report, when successful. */
  channel?: 'sentry' | 'github'
  /** True when a bug fell back to a GitHub issue because Sentry was unavailable. */
  fallback?: boolean
  /** The created GitHub issue, so the client can link the reporter to it. */
  issue?: { number: number, url: string }
}

/**
 * Identity returned by the host-supplied `resolveUser(event)` hook.
 * Every field is optional; the hook may also return `null` for anonymous users.
 */
export interface ResolvedUser {
  id?: string
  email?: string
  name?: string
}

/** Public (client-exposed) slice of the module config. Never contains secrets. */
export interface PublicFeedbackConfig {
  shortcut: string
  enabled: boolean
  app?: string
  /** Host build identifier (git SHA); the dialog attaches it to every report. */
  version?: string
}

/**
 * Resolved label config. When `prefixed` is false the module emits a single
 * legacy label (`bug`/`feature`); when true it emits the prefixed scheme
 * (`base`, `type:`, `app:`, `severity:`). See `buildLabels`.
 */
export interface LabelConfig {
  bug: string
  feature: string
  prefixed: boolean
  base: string
  typePrefix: string
  appPrefix: string
  severityPrefix: string
  categoryPrefix: string
}

/** Private (server-only) slice of the module config. */
export interface PrivateFeedbackConfig {
  sentry: boolean
  github: {
    repo: string
    labels: LabelConfig
  }
}

/** Response from the identity endpoint — tells the client whether to ask for an email. */
export interface FeedbackIdentity {
  /** True when the host's resolveUser hook returned a user for this request. */
  identified: boolean
}

/** Open/closed state of a GitHub issue. */
export type FeedbackState = 'open' | 'closed'

/**
 * One report the current browser has filed, persisted client-side in
 * localStorage. Only GitHub-channel submissions (ideas + bug fallbacks) are
 * stored — a bug captured by Sentry has no issue to track. `title` is kept
 * locally and never round-tripped through the status endpoint.
 */
export interface StoredSubmission {
  type: FeedbackType
  issueNumber: number
  issueUrl: string
  title: string
  /** ISO-8601 timestamp of submission. */
  submittedAt: string
  /** Last-known issue state, refreshed by the status endpoint. */
  state?: FeedbackState
  /** Last-known total comment count (from the status endpoint). */
  comments?: number
  /** Comment count the reporter has already seen (drives the unread dot). */
  seenComments?: number
  /** ISO-8601 timestamp of the last successful status refresh. */
  checkedAt?: string
}

/**
 * One item in the status endpoint response. Deliberately carries no title or
 * body — the client already has the title locally, so the server never echoes
 * issue content back (blocks issue-number enumeration from leaking titles).
 * `comments` is the issue's total comment count, used for the unread indicator.
 */
export interface FeedbackStatus {
  number: number
  state: FeedbackState
  comments: number
}

/** Who wrote a thread message: the reporter (via the widget) or the team. */
export type FeedbackMessageOrigin = 'reporter' | 'team'

/** One message in an issue's comment thread, shown in the widget. */
export interface FeedbackThreadMessage {
  id: string
  /** GitHub login of the comment author (the bot, for reporter messages). */
  author: string
  /** Comment body, with the internal reporter marker stripped. */
  body: string
  /** ISO-8601 creation time. */
  createdAt: string
  origin: FeedbackMessageOrigin
}

/** An issue's thread: its current state plus every comment (issue body excluded). */
export interface FeedbackThread {
  number: number
  state: FeedbackState
  messages: FeedbackThreadMessage[]
}
