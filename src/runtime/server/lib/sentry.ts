import type { FeedbackContext, ResolvedUser } from '../../types'

export interface CaptureBugArgs {
  message: string
  email?: string
  user: ResolvedUser | null
  context?: FeedbackContext
}

/**
 * Forward a bug report to the host's server-side Sentry SDK.
 *
 * `@sentry/node` is an OPTIONAL peer dependency: it is imported lazily and
 * guarded, so a host without Sentry (or with it disabled) degrades gracefully.
 * Returns `true` when the report was captured, `false` when the caller should
 * fall back to another channel (e.g. a GitHub issue).
 */
export async function captureBugInSentry(args: CaptureBugArgs): Promise<boolean> {
  const Sentry = await import('@sentry/node').catch(() => null)
  if (!Sentry) {
    console.warn('[feedback] @sentry/node is not installed — cannot capture bug via Sentry')
    return false
  }

  // The host initialises Sentry in its own Nitro process; we reuse that client.
  // If it was never initialised, capturing would be a no-op, so bail to fallback.
  if (typeof Sentry.isInitialized === 'function' && !Sentry.isInitialized()) {
    console.warn('[feedback] Sentry is not initialised in this process — falling back')
    return false
  }

  const name = args.user?.name
  const email = args.user?.email || args.email

  // Severity and category are bug-only signals; forward them as searchable tags.
  const bugTags = {
    feedbackType: 'bug',
    ...(args.context?.app ? { app: args.context.app } : {}),
    ...(args.context?.severity ? { severity: args.context.severity } : {}),
    ...(args.context?.category ? { category: args.context.category } : {}),
  }

  try {
    if (typeof Sentry.captureFeedback === 'function') {
      Sentry.captureFeedback({
        message: args.message,
        name,
        email,
        url: args.context?.url,
        tags: bugTags,
      })
    }
    else {
      // Older SDKs without the User Feedback API: fall back to a message event.
      if (args.user) {
        Sentry.setUser({ id: args.user.id, email, username: name })
      }
      Sentry.captureMessage(args.message, {
        level: 'warning',
        tags: bugTags,
      })
    }

    // Long-running Nitro flushes in the background, but flush explicitly so the
    // report is delivered even if the process is short-lived.
    if (typeof Sentry.flush === 'function') {
      await Sentry.flush(2000)
    }
    return true
  }
  catch (error) {
    console.error('[feedback] Sentry capture failed', error)
    return false
  }
}
