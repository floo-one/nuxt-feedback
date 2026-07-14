import type { FeedbackContext, FeedbackSeverity, FeedbackState, FeedbackStatus, FeedbackThread, FeedbackThreadMessage, FeedbackType, LabelConfig, ResolvedUser } from '../../types'

/** Max issue numbers a single status request will look up. */
const MAX_STATUS_LOOKUPS = 50

/**
 * Hidden marker prefixed to comments the widget posts on the reporter's behalf.
 * It's an HTML comment (invisible in GitHub's rendered view) so the server can
 * tell reporter messages from team replies — every widget comment is authored by
 * the same bot token, so author alone can't distinguish them.
 */
export const REPORTER_MARKER = '<!-- floo-feedback:reporter -->'

/** Shared GitHub REST headers for a bearer-token request. */
function githubHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'floo-one-nuxt-feedback',
  }
}

export interface CreateIssueArgs {
  repo: string
  token: string
  type: FeedbackType
  message: string
  labels: string[]
  /** Resolved app bucket (from the host hook or `context.app`), for the body. */
  app?: string | null
  email?: string
  user: ResolvedUser | null
  context?: FeedbackContext
}

const TYPE_PREFIX: Record<FeedbackType, string> = {
  bug: '[Bug]',
  feature: '[Feature]',
}

/** Human label for the type in the prefixed scheme: `feature` reads as `idea`. */
const TYPE_SLUG: Record<FeedbackType, string> = {
  bug: 'bug',
  feature: 'idea',
}

/**
 * Build the issue labels from the resolved config.
 * Legacy scheme → a single `bug`/`feature` label. Prefixed scheme → `base`,
 * `type:<slug>`, `app:<bucket>` (when resolved), and `severity:<level>` (bugs only).
 */
export function buildLabels(args: {
  type: FeedbackType
  app?: string | null
  severity?: FeedbackSeverity
  config: LabelConfig
}): string[] {
  const { type, app, severity, config } = args
  if (!config.prefixed) {
    return [type === 'bug' ? config.bug : config.feature]
  }
  const labels: string[] = []
  if (config.base) labels.push(config.base)
  labels.push(`${config.typePrefix}${TYPE_SLUG[type]}`)
  if (app) labels.push(`${config.appPrefix}${app}`)
  if (type === 'bug' && severity) labels.push(`${config.severityPrefix}${severity}`)
  return labels
}

export function buildTitle(type: FeedbackType, message: string): string {
  const firstLine = message.trim().split('\n')[0]!.trim()
  const truncated = firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine
  return `${TYPE_PREFIX[type]} ${truncated || 'New report'}`
}

export function buildReporter(user: ResolvedUser | null, email?: string): string {
  if (!user && !email) {
    return 'anonymous'
  }
  const parts: string[] = []
  if (user?.name) parts.push(user.name)
  const contact = user?.email || email
  if (contact) parts.push(`<${contact}>`)
  if (user?.id) parts.push(`(id: ${user.id})`)
  return parts.join(' ') || 'anonymous'
}

export function buildBody(args: CreateIssueArgs): string {
  const { message, user, email, context, app, type } = args
  const lines = [
    message.trim(),
    '',
    '---',
    `**Reporter:** ${buildReporter(user, email)}`,
  ]
  const appName = app || context?.app
  if (appName) lines.push(`**App:** ${appName}`)
  if (type === 'bug' && context?.severity) lines.push(`**Severity:** ${context.severity}`)
  if (context?.url) lines.push(`**URL:** ${context.url}`)
  if (context?.version) lines.push(`**Version:** ${context.version}`)
  if (context?.userAgent) lines.push(`**User agent:** ${context.userAgent}`)
  lines.push(`**Submitted:** ${context?.ts || new Date().toISOString()}`)

  // Bugs carry a client-side console-error ring buffer. Render it explicitly
  // (including "none captured") so triagers know whether it was empty vs absent.
  if (type === 'bug' && context?.consoleErrors) {
    lines.push('', '**Recent console errors:**')
    if (context.consoleErrors.length > 0) {
      lines.push('```', ...context.consoleErrors, '```')
    }
    else {
      lines.push('_none captured_')
    }
  }

  lines.push('', '_Filed via @floo-one/nuxt-feedback._')
  return lines.join('\n')
}

interface GitHubIssueResponse {
  number: number
  html_url: string
}

/**
 * Create a GitHub issue via the REST API using a raw `$fetch` call.
 * Throws on missing config or a failed request — the caller maps that to a
 * clean `{ ok: false }` response without leaking provider internals.
 */
export async function createGitHubIssue(args: CreateIssueArgs): Promise<GitHubIssueResponse> {
  const { repo, token } = args
  if (!repo) {
    throw new Error('[feedback] github.repo is not configured')
  }
  if (!token) {
    throw new Error('[feedback] NUXT_GITHUB_TOKEN is not set')
  }

  return await $fetch<GitHubIssueResponse>(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: githubHeaders(token),
    body: {
      title: buildTitle(args.type, args.message),
      body: buildBody(args),
      labels: args.labels,
    },
  })
}

/**
 * Parse the `numbers` query of the status endpoint into a clean, bounded list of
 * positive integers. Ignores blanks, non-numerics, and duplicates; caps the
 * count so a client can't force an unbounded fan-out of GitHub calls.
 */
export function parseIssueNumbers(raw: unknown): number[] {
  if (typeof raw !== 'string' || !raw) return []
  const nums = raw
    .split(',')
    .map(s => Number.parseInt(s.trim(), 10))
    .filter(n => Number.isInteger(n) && n > 0)
  return [...new Set(nums)].slice(0, MAX_STATUS_LOOKUPS)
}

/**
 * Fetch a single issue's open/closed state and comment count. Returns `null` on
 * any failure (404 for a deleted/renamed issue, auth, network) so the caller can
 * simply omit it — a missing status is not an error.
 */
export async function fetchIssueState(
  repo: string,
  token: string,
  number: number,
): Promise<FeedbackStatus | null> {
  try {
    const issue = await $fetch<{ number: number, state: string, comments?: number }>(
      `https://api.github.com/repos/${repo}/issues/${number}`,
      { headers: githubHeaders(token) },
    )
    const state: FeedbackState = issue.state === 'closed' ? 'closed' : 'open'
    return {
      number: issue.number,
      state,
      comments: typeof issue.comments === 'number' ? issue.comments : 0,
    }
  }
  catch {
    return null
  }
}

interface RawComment {
  id: number
  body?: string
  created_at?: string
  user?: { login?: string } | null
}

/**
 * Map a raw GitHub comment to a widget thread message. Detects the reporter
 * marker (so reporter-authored messages render on their side) and strips it from
 * the displayed body. Pure — unit-tested.
 */
export function mapThreadMessage(raw: RawComment): FeedbackThreadMessage {
  const rawBody = raw.body || ''
  const isReporter = rawBody.startsWith(REPORTER_MARKER)
  const body = isReporter ? rawBody.slice(REPORTER_MARKER.length).trimStart() : rawBody
  return {
    id: String(raw.id),
    author: raw.user?.login || 'unknown',
    body,
    createdAt: raw.created_at || '',
    origin: isReporter ? 'reporter' : 'team',
  }
}

/**
 * Build the comment body posted on a reporter's behalf. Prefixed with the hidden
 * marker (so it's recognised as reporter-origin) and a human attribution line
 * (since the actual GitHub author is the bot token). Pure — unit-tested.
 */
export function buildCommentBody(user: ResolvedUser | null, email: string | undefined, message: string): string {
  const who = user?.name || user?.email || email || 'A reporter'
  return `${REPORTER_MARKER}\n**${who}** (via feedback widget):\n\n${message.trim()}`
}

/**
 * Fetch an issue's thread: current state plus every comment (the issue body
 * itself is excluded — the reporter wrote it and it carries metadata noise).
 * Returns `null` on failure so the route degrades cleanly.
 */
export async function fetchIssueThread(
  repo: string,
  token: string,
  number: number,
): Promise<FeedbackThread | null> {
  try {
    const headers = githubHeaders(token)
    const [issue, comments] = await Promise.all([
      $fetch<{ number: number, state: string }>(
        `https://api.github.com/repos/${repo}/issues/${number}`,
        { headers },
      ),
      $fetch<RawComment[]>(
        `https://api.github.com/repos/${repo}/issues/${number}/comments?per_page=100`,
        { headers },
      ),
    ])
    return {
      number: issue.number,
      state: issue.state === 'closed' ? 'closed' : 'open',
      messages: comments.map(mapThreadMessage),
    }
  }
  catch {
    return null
  }
}

/** Post a comment on an issue as the bot token. Throws on failure. */
export async function postIssueComment(
  repo: string,
  token: string,
  number: number,
  body: string,
): Promise<FeedbackThreadMessage> {
  const comment = await $fetch<RawComment>(
    `https://api.github.com/repos/${repo}/issues/${number}/comments`,
    { method: 'POST', headers: githubHeaders(token), body: { body } },
  )
  return mapThreadMessage(comment)
}
