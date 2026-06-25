import type { FeedbackContext, FeedbackType, ResolvedUser } from '../../types'

export interface CreateIssueArgs {
  repo: string
  token: string
  type: FeedbackType
  message: string
  label: string
  email?: string
  user: ResolvedUser | null
  context?: FeedbackContext
}

const TYPE_PREFIX: Record<FeedbackType, string> = {
  bug: '[Bug]',
  feature: '[Feature]',
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

function buildBody(args: CreateIssueArgs): string {
  const { message, user, email, context } = args
  const lines = [
    message.trim(),
    '',
    '---',
    `**Reporter:** ${buildReporter(user, email)}`,
  ]
  if (context?.app) lines.push(`**App:** ${context.app}`)
  if (context?.url) lines.push(`**URL:** ${context.url}`)
  if (context?.userAgent) lines.push(`**User agent:** ${context.userAgent}`)
  lines.push(`**Submitted:** ${context?.ts || new Date().toISOString()}`)
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
      labels: args.label ? [args.label] : [],
    },
  })
}
