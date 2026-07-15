import { defineEventHandler, readValidatedBody, setResponseStatus } from 'h3'
import { z } from 'zod'
import { useRuntimeConfig } from '#imports'
import resolveUser from '#feedback/resolve-user'
import resolveApp from '#feedback/resolve-app'
import onSubmit from '#feedback/on-submit'
import { buildLabels, createGitHubIssue } from '../lib/github'
import type { FeedbackReport, FeedbackResponse, FeedbackResult, PrivateFeedbackConfig } from '../../types'

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
      severity: z.enum(['critical', 'blocking', 'annoying', 'cosmetic']).optional(),
      category: z.enum(['crash', 'visual', 'data', 'performance']).optional(),
      // Always-on environment snapshot. Cap every field: never trust client lengths.
      environment: z
        .object({
          viewport: z.string().max(20).optional(),
          screen: z.string().max(20).optional(),
          dpr: z.number().optional(),
          locale: z.string().max(35).optional(),
          timezone: z.string().max(60).optional(),
          online: z.boolean().optional(),
          browser: z.string().max(60).optional(),
        })
        .partial()
        .optional(),
      // Bug-only activity trail. Bounded count + per-entry length.
      breadcrumbs: z
        .array(z.object({
          t: z.string().max(40),
          kind: z.enum(['click', 'nav', 'fetch', 'console']),
          text: z.string().max(400),
        }))
        .max(50)
        .optional(),
      // Deprecated: older clients may still send this; superseded by breadcrumbs.
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
    category: body.context?.category,
    config: feedback.github.labels,
  })

  try {
    // Both bug and feature file a GitHub issue — one path, no provider branching.
    const issue = await createGitHubIssue({
      repo: feedback.github.repo,
      token,
      type: body.type,
      message: body.message,
      labels,
      app,
      email,
      user,
      context: body.context,
    })

    const result: FeedbackResult = {
      channel: 'github',
      issue: { number: issue.number, url: issue.html_url },
    }

    // Host submit hook: notifications, logging, "my reports" tracking, etc. It
    // runs after the issue is filed and must never fail the user's submission.
    const report: FeedbackReport = {
      type: body.type,
      message: body.message,
      severity: body.context?.severity,
      category: body.context?.category,
      user,
      email,
      app,
      labels,
      context: body.context,
    }
    await onSubmit(report, result).catch((error) => {
      console.error('[feedback] onSubmit threw; ignoring', error)
    })

    return { ok: true, ...result }
  }
  catch (error) {
    // Log server-side; return a clean response that leaks no provider internals.
    console.error('[feedback] delivery failed', error)
    setResponseStatus(event, 502)
    return { ok: false }
  }
})
