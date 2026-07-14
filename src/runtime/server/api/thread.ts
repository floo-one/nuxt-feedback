import { createError, defineEventHandler, getQuery, readValidatedBody } from 'h3'
import { z } from 'zod'
import { useRuntimeConfig } from '#imports'
import resolveUser from '#feedback/resolve-user'
import { buildCommentBody, fetchIssueThread, postIssueComment } from '../lib/github'
import type { FeedbackThread, FeedbackThreadMessage, PrivateFeedbackConfig } from '../../types'

/**
 * The comment-thread bridge between the widget and a GitHub issue.
 *
 * `GET  /api/__feedback/thread?number=N` → `{ number, state, messages }`.
 * `POST /api/__feedback/thread` `{ number, message }` → the created message.
 *
 * Both methods live in ONE handler: registering GET and POST on the same route
 * via two `addServerHandler` calls makes Nitro drop the route, so we register
 * once (any method) and branch here.
 *
 * Gated on an identified user — reporters are logged-in staff, and it keeps the
 * route from being an open read/write proxy into the repo's issues. Reads exclude
 * the issue body (metadata noise); writes post as the bot token, prefixed with a
 * hidden reporter marker so the thread view can render them on the reporter's side.
 */

const postSchema = z.object({
  number: z.number().int().positive(),
  message: z.string().trim().min(1, 'Message is required').max(5000, 'Message is too long'),
})

export default defineEventHandler(async (event): Promise<FeedbackThread | FeedbackThreadMessage> => {
  const user = await resolveUser(event).catch(() => null)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Sign in to view replies' })
  }

  const config = useRuntimeConfig(event)
  const feedback = config.feedback as PrivateFeedbackConfig
  const token = config.githubToken as string
  const repo = feedback?.github?.repo

  // ---- Reply -------------------------------------------------------------
  if (event.method === 'POST') {
    const { number, message } = await readValidatedBody(event, postSchema.parse)
    if (!repo || !token) {
      throw createError({ statusCode: 500, statusMessage: 'Feedback not configured' })
    }
    try {
      return await postIssueComment(repo, token, number, buildCommentBody(user, user.email, message))
    }
    catch (error) {
      console.error('[feedback] posting comment failed', error)
      throw createError({ statusCode: 502, statusMessage: 'Could not post reply' })
    }
  }

  // ---- Read thread -------------------------------------------------------
  const number = Number.parseInt(String(getQuery(event).number ?? ''), 10)
  if (!repo || !token || !Number.isInteger(number) || number <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Bad request' })
  }

  const thread = await fetchIssueThread(repo, token, number)
  if (!thread) {
    throw createError({ statusCode: 404, statusMessage: 'Thread unavailable' })
  }
  return thread
})
