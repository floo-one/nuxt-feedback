import type { FeedbackContext, FeedbackSeverity, FeedbackType, LabelConfig, ResolvedUser } from '../../types'

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
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'floo-one-nuxt-feedback',
    },
    body: {
      title: buildTitle(args.type, args.message),
      body: buildBody(args),
      labels: args.labels,
    },
  })
}
