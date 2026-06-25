import { defineEventHandler, readValidatedBody, setResponseStatus } from 'h3'
import { z } from 'zod'
import { useRuntimeConfig } from '#imports'
import resolveUser from '#feedback/resolve-user'
import { createGitHubIssue } from '../lib/github'
import { captureBugInSentry } from '../lib/sentry'
import type { FeedbackResponse, PrivateFeedbackConfig } from '../../types'

const bodySchema = z.object({
  type: z.enum(['bug', 'feature', 'feedback']),
  message: z
    .string()
    .trim()
    .min(1, 'Message is required')
    .max(5000, 'Message is too long'),
  email: z.union([z.literal(''), z.email()]).optional(),
  context: z
    .object({
      url: z.string().optional(),
      userAgent: z.string().optional(),
      app: z.string().optional(),
      ts: z.string().optional(),
    })
    .partial()
    .optional(),
})

export default defineEventHandler(async (event): Promise<FeedbackResponse> => {
  const body = await readValidatedBody(event, bodySchema.parse)

  const config = useRuntimeConfig(event)
  const feedback = config.feedback as PrivateFeedbackConfig
  const token = config.githubToken as string

  // Identity is resolved by the host; never throw on its behalf.
  const user = await resolveUser(event).catch((error) => {
    console.error('[feedback] resolveUser threw; treating as anonymous', error)
    return null
  })

  const email = body.email || undefined

  try {
    if (body.type === 'bug') {
      const captured = feedback.sentry
        ? await captureBugInSentry({ message: body.message, email, user, context: body.context })
        : false
      if (captured) {
        return { ok: true, channel: 'sentry' }
      }

      // Sentry unavailable/disabled: never drop a bug — file it as a GitHub issue.
      console.warn('[feedback] bug route falling back to GitHub issue')
      await createGitHubIssue({
        repo: feedback.github.repo,
        token,
        type: 'bug',
        message: body.message,
        label: feedback.github.labels.bug,
        email,
        user,
        context: body.context,
      })
      return { ok: true, channel: 'github', fallback: true }
    }

    // feature | feedback → GitHub issue
    const label
      = body.type === 'feature' ? feedback.github.labels.feature : feedback.github.labels.feedback
    await createGitHubIssue({
      repo: feedback.github.repo,
      token,
      type: body.type,
      message: body.message,
      label,
      email,
      user,
      context: body.context,
    })
    return { ok: true, channel: 'github' }
  }
  catch (error) {
    // Log server-side; return a clean response that leaks no provider internals.
    console.error('[feedback] delivery failed', error)
    setResponseStatus(event, 502)
    return { ok: false }
  }
})
