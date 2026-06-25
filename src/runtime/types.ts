/**
 * Shared types for @floo-one/nuxt-feedback.
 *
 * This file is imported by both client and server runtime code, so it must
 * stay free of any runtime imports (types only).
 */

export type FeedbackType = 'bug' | 'feature' | 'feedback'

export interface FeedbackContext {
  /** Page URL the feedback was sent from. */
  url?: string
  /** Browser user agent. */
  userAgent?: string
  /** Host application name (e.g. "GLE Bookings"). */
  app?: string
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
}

/** Private (server-only) slice of the module config. */
export interface PrivateFeedbackConfig {
  sentry: boolean
  github: {
    repo: string
    labels: {
      bug: string
      feature: string
      feedback: string
    }
  }
}
