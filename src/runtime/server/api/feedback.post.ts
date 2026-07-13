import { defineEventHandler, readValidatedBody, setResponseStatus } from 'h3'
import { z } from 'zod'
import { useRuntimeConfig } from '#imports'
import resolveUser from '#feedback/resolve-user'
import resolveApp from '#feedback/resolve-app'
import { buildLabels, createGitHubIssue } from '../lib/github'
import { captureBugInSentry } from '../lib/sentry'
import type { FeedbackResponse, PrivateFeedbackConfig } from '../../types'

const bodySchema = z.object({
  type: z.enum(['bug', 'feature']),
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
      // Never trust client-supplied lengths: cap version and the console buffer.
      version: z.string().max(200).optional(),
      severity: z.enum(['blocking', 'annoying', 'cosmetic']).optional(),
      consoleErrors: z.array(z.string().max(500)).max(20).optional(),
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

  // App bucket is resolved by the host too (route→bucket); fall back to context.app.
  const app = (await resolveApp(event, body.context).catch((error) => {
    console.error('[feedback] resolveApp threw; ignoring', error)
    return null
  })) || body.context?.app || null

  const email = body.email || undefined
  const labels = buildLabels({
    type: body.type,
    app,
    severity: body.context?.severity,
    config: feedback.github.labels,
  })

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
      const issue = await createGitHubIssue({
        repo: feedback.github.repo,
        token,
        type: 'bug',
        message: body.message,
        labels,
        app,
        email,
        user,
        context: body.context,
      })
      return { ok: true, channel: 'github', fallback: true, issue: { number: issue.number, url: issue.html_url } }
    }

    // feature → GitHub issue
    const issue = await createGitHubIssue({
      repo: feedback.github.repo,
      token,
      type: 'feature',
      message: body.message,
      labels,
      app,
      email,
      user,
      context: body.context,
    })
    return { ok: true, channel: 'github', issue: { number: issue.number, url: issue.html_url } }
  }
  catch (error) {
    // Log server-side; return a clean response that leaks no provider internals.
    console.error('[feedback] delivery failed', error)
    setResponseStatus(event, 502)
    return { ok: false }
  }
})
