import { defineEventHandler, readValidatedBody, setResponseStatus } from 'h3'
import { z } from 'zod'
import { useRuntimeConfig } from '#imports'
import resolveUser from '#feedback/resolve-user'
import resolveApp from '#feedback/resolve-app'
import onSubmit from '#feedback/on-submit'
import { buildLabels, createGitHubIssue, uploadScreenshot } from '../lib/github'
import type { FeedbackReport, FeedbackResponse, FeedbackResult, PrivateFeedbackConfig } from '../../types'

/** Largest screenshot data URL accepted (about 2 MB of JPEG). */
const MAX_SCREENSHOT = 2_800_000

const size = z.object({ width: z.number(), height: z.number() })

// The picked element. Every string is capped: it comes straight from the page.
const elementSchema = z.object({
  selector: z.string().max(1000),
  tag: z.string().max(40),
  text: z.string().max(300).optional(),
  alt: z.string().max(300).optional(),
  href: z.string().max(1000).optional(),
  src: z.string().max(1000).optional(),
  rect: size.optional(),
  natural: size.optional(),
  section: z.object({ id: z.string().max(200).optional(), heading: z.string().max(200).optional() }).optional(),
  card: z.object({ title: z.string().max(200).optional(), src: z.string().max(1000).optional() }).optional(),
  components: z.array(z.string().max(300)).max(10).optional(),
  contains: z.array(z.string().max(300)).max(10).optional(),
  screenshot: z.string().max(MAX_SCREENSHOT).optional(),
})

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
      elements: z.array(elementSchema).max(5).optional(),
      screenshot: z.string().max(MAX_SCREENSHOT).optional(),
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

  if (feedback.requireUser && !user) {
    setResponseStatus(event, 401)
    return { ok: false }
  }

  // The build commit comes from the server, never the page: Coolify sets SOURCE_COMMIT.
  const build = process.env.SOURCE_COMMIT || feedback.buildCommit
  const context = body.context ? { ...body.context } : undefined
  if (context && build) context.version = build

  // Screenshots go to the assets repo first; a failed upload drops the image, not the report.
  if (context) {
    const upload = async (dataUrl: string | undefined, label: string) => {
      if (!dataUrl || !feedback.github.assetsRepo) return undefined
      return uploadScreenshot({ assetsRepo: feedback.github.assetsRepo, repo: feedback.github.repo, token, dataUrl, label })
        .catch((error) => {
          console.error('[feedback] screenshot upload failed; filing without it', error)
          return undefined
        })
    }
    const [page, ...shots] = await Promise.all([
      upload(context.screenshot, 'page'),
      ...(context.elements ?? []).map((e, i) => upload(e.screenshot, `element-${i + 1}`)),
    ])
    context.screenshot = page
    context.elements = context.elements?.map((e, i) => ({ ...e, screenshot: shots[i] }))
  }

  const email = body.email || undefined
  const labels = buildLabels({
    type: body.type,
    app,
    severity: context?.severity,
    category: context?.category,
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
      context,
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
      severity: context?.severity,
      category: context?.category,
      user,
      email,
      app,
      labels,
      context,
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
