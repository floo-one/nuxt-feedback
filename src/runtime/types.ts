/**
 * Shared types for @floo-one/nuxt-feedback.
 *
 * This file is imported by both client and server runtime code, so it must
 * stay free of any runtime imports (types only).
 */

export type FeedbackType = 'bug' | 'feature'

/** How badly a bug hurts. Ignored for feature/idea submissions. */
export type FeedbackSeverity = 'blocking' | 'annoying' | 'cosmetic'

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
