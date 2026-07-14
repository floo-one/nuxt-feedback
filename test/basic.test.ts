import { describe, it, expect } from 'vitest'
import { REPORTER_MARKER, buildBody, buildCommentBody, buildLabels, buildReporter, buildTitle, formatBreadcrumbs, formatEnvironment, mapThreadMessage, parseIssueNumbers } from '../src/runtime/server/lib/github'
import type { CreateIssueArgs } from '../src/runtime/server/lib/github'
import { applyStates, capSubmissions, hasUnread } from '../src/runtime/utils/submissionStore'
import { redact } from '../src/runtime/utils/redact'
import { parseBrowser } from '../src/runtime/utils/environment'
import type { Breadcrumb, LabelConfig, StoredSubmission } from '../src/runtime/types'

const legacyConfig: LabelConfig = {
  bug: 'bug',
  feature: 'enhancement',
  prefixed: false,
  base: 'feedback',
  typePrefix: 'type:',
  appPrefix: 'app:',
  severityPrefix: 'severity:',
  categoryPrefix: 'category:',
}
const prefixedConfig: LabelConfig = { ...legacyConfig, prefixed: true }

describe('github issue formatting', () => {
  it('prefixes the title by type and truncates the first line', () => {
    expect(buildTitle('bug', 'App crashes on save')).toBe('[Bug] App crashes on save')
    expect(buildTitle('feature', 'Dark mode\nplease')).toBe('[Feature] Dark mode')

    const long = 'x'.repeat(200)
    const title = buildTitle('feature', long)
    expect(title.startsWith('[Feature] ')).toBe(true)
    expect(title.endsWith('…')).toBe(true)
    expect(title.length).toBeLessThanOrEqual('[Feature] '.length + 80)
  })

  it('formats the reporter from identity, falling back to anonymous', () => {
    expect(buildReporter(null)).toBe('anonymous')
    expect(buildReporter({ name: 'Ada', email: 'ada@example.com', id: 'u1' }))
      .toBe('Ada <ada@example.com> (id: u1)')
    expect(buildReporter(null, 'guest@example.com')).toBe('<guest@example.com>')
  })
})

describe('buildLabels', () => {
  it('legacy scheme emits a single label per type', () => {
    expect(buildLabels({ type: 'bug', config: legacyConfig })).toEqual(['bug'])
    expect(buildLabels({ type: 'feature', config: legacyConfig })).toEqual(['enhancement'])
  })

  it('legacy scheme ignores app, severity and category', () => {
    expect(buildLabels({ type: 'bug', app: 'booking', severity: 'blocking', category: 'crash', config: legacyConfig }))
      .toEqual(['bug'])
  })

  it('prefixed scheme emits base + type + app + severity + category for a bug', () => {
    expect(buildLabels({ type: 'bug', app: 'booking', severity: 'critical', category: 'crash', config: prefixedConfig }))
      .toEqual(['feedback', 'type:bug', 'app:booking', 'severity:critical', 'category:crash'])
  })

  it('prefixed scheme maps feature to type:idea and omits severity/category', () => {
    expect(buildLabels({ type: 'feature', app: 'sales', severity: 'blocking', category: 'visual', config: prefixedConfig }))
      .toEqual(['feedback', 'type:idea', 'app:sales'])
  })

  it('prefixed scheme omits the app label when no bucket resolves', () => {
    expect(buildLabels({ type: 'bug', app: null, severity: 'cosmetic', config: prefixedConfig }))
      .toEqual(['feedback', 'type:bug', 'severity:cosmetic'])
  })
})

describe('buildBody', () => {
  const base: CreateIssueArgs = {
    repo: 'o/r',
    token: 't',
    type: 'bug',
    message: 'It broke',
    labels: [],
    user: { name: 'Ada', email: 'ada@x.io', id: 'u1' },
    context: { url: 'https://app/x', ts: '2026-01-01T00:00:00Z' },
  }

  it('renders resolved app, severity, type, version for a bug', () => {
    const body = buildBody({
      ...base,
      app: 'booking',
      context: { ...base.context, severity: 'critical', category: 'data', version: 'abc123' },
    })
    expect(body).toContain('**App:** booking')
    expect(body).toContain('**Severity:** critical')
    expect(body).toContain('**Type:** data')
    expect(body).toContain('**Version:** abc123')
    expect(body).toContain('**Reporter:** Ada <ada@x.io> (id: u1)')
  })

  it('keeps the summary visible and tucks diagnostics into a <details> block', () => {
    const body = buildBody({
      ...base,
      app: 'booking',
      context: { ...base.context, severity: 'blocking', version: 'abc123' },
    })
    expect(body).toContain('<details>')
    expect(body).toContain('<summary>Diagnostics</summary>')
    expect(body).toContain('</details>')

    const summary = body.slice(0, body.indexOf('<details>'))
    const details = body.slice(body.indexOf('<details>'))
    // Reporter / App / Severity stay above the fold; URL / Version / Submitted collapse.
    expect(summary).toContain('**Reporter:**')
    expect(summary).toContain('**App:** booking')
    expect(summary).toContain('**Severity:** blocking')
    expect(details).toContain('**URL:** https://app/x')
    expect(details).toContain('**Version:** abc123')
    expect(details).toContain('**Submitted:**')
  })

  it('renders a fenced console-error block, and "none captured" when empty', () => {
    const withErrors = buildBody({ ...base, context: { ...base.context, consoleErrors: ['TypeError: x'] } })
    expect(withErrors).toContain('**Recent console errors:**')
    expect(withErrors).toContain('```')
    expect(withErrors).toContain('TypeError: x')

    const empty = buildBody({ ...base, context: { ...base.context, consoleErrors: [] } })
    expect(empty).toContain('_none captured_')
  })

  it('omits severity, type and console block for feedback submissions', () => {
    const body = buildBody({
      ...base,
      type: 'feature',
      context: { ...base.context, severity: 'blocking', category: 'crash', consoleErrors: ['x'] },
    })
    expect(body).not.toContain('**Severity:**')
    expect(body).not.toContain('**Type:**')
    expect(body).not.toContain('Recent console errors')
  })
})

describe('parseIssueNumbers', () => {
  it('parses a comma list into positive integers', () => {
    expect(parseIssueNumbers('1,2,3')).toEqual([1, 2, 3])
    expect(parseIssueNumbers(' 4 , 5 ')).toEqual([4, 5])
  })

  it('drops blanks, non-numerics, zero, and negatives', () => {
    expect(parseIssueNumbers('1,,x,-2,0,3')).toEqual([1, 3])
  })

  it('de-duplicates and returns [] for non-strings', () => {
    expect(parseIssueNumbers('7,7,8')).toEqual([7, 8])
    expect(parseIssueNumbers(undefined)).toEqual([])
    expect(parseIssueNumbers(['1'])).toEqual([])
  })

  it('caps the count at 50', () => {
    const raw = Array.from({ length: 80 }, (_, i) => i + 1).join(',')
    expect(parseIssueNumbers(raw)).toHaveLength(50)
  })
})

describe('submission store helpers', () => {
  const mk = (n: number, submittedAt: string, extra: Partial<StoredSubmission> = {}): StoredSubmission => ({
    type: 'bug',
    issueNumber: n,
    issueUrl: `https://github.com/o/r/issues/${n}`,
    title: `Report ${n}`,
    submittedAt,
    ...extra,
  })

  it('capSubmissions sorts newest-first and de-dupes by issue number', () => {
    const out = capSubmissions([
      mk(1, '2026-01-01T00:00:00Z'),
      mk(2, '2026-03-01T00:00:00Z'),
      mk(1, '2026-02-01T00:00:00Z'),
    ])
    expect(out.map(s => s.issueNumber)).toEqual([2, 1])
    // The kept #1 is the first seen after sorting (the newer one).
    expect(out.find(s => s.issueNumber === 1)!.submittedAt).toBe('2026-02-01T00:00:00Z')
  })

  it('capSubmissions caps at 50 entries', () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      mk(i + 1, `2026-01-01T00:${String(i).padStart(2, '0')}:00Z`))
    expect(capSubmissions(many)).toHaveLength(50)
  })

  it('applyStates merges state + comment count by number and stamps checkedAt', () => {
    const list = [mk(1, '2026-01-01T00:00:00Z'), mk(2, '2026-01-02T00:00:00Z')]
    const out = applyStates(list, [{ number: 1, state: 'closed', comments: 3 }], '2026-05-01T00:00:00Z')
    const one = out.find(s => s.issueNumber === 1)!
    const two = out.find(s => s.issueNumber === 2)!
    expect(one.state).toBe('closed')
    expect(one.comments).toBe(3)
    expect(one.checkedAt).toBe('2026-05-01T00:00:00Z')
    // Unmatched entries are untouched.
    expect(two.state).toBeUndefined()
    expect(two.comments).toBeUndefined()
    expect(two.checkedAt).toBeUndefined()
  })

  it('hasUnread is true only when comments outnumber those seen', () => {
    expect(hasUnread(mk(1, 'x'))).toBe(false)
    expect(hasUnread(mk(1, 'x', { comments: 2, seenComments: 2 }))).toBe(false)
    expect(hasUnread(mk(1, 'x', { comments: 3, seenComments: 1 }))).toBe(true)
    expect(hasUnread(mk(1, 'x', { comments: 1 }))).toBe(true)
  })
})

describe('thread messages', () => {
  it('buildCommentBody prefixes the reporter marker and attribution', () => {
    const body = buildCommentBody({ name: 'Ada' }, undefined, '  needs dark mode  ')
    expect(body.startsWith(REPORTER_MARKER)).toBe(true)
    expect(body).toContain('**Ada** (via feedback widget):')
    expect(body).toContain('needs dark mode')
    expect(body).not.toContain('  needs dark mode  ')
  })

  it('buildCommentBody falls back through email then a generic label', () => {
    expect(buildCommentBody(null, 'guest@x.io', 'hi')).toContain('**guest@x.io**')
    expect(buildCommentBody(null, undefined, 'hi')).toContain('**A reporter**')
  })

  it('mapThreadMessage flags reporter-origin and strips the marker', () => {
    const reporter = mapThreadMessage({
      id: 10,
      body: `${REPORTER_MARKER}\n**Ada** (via feedback widget):\n\nplease fix`,
      created_at: '2026-01-01T00:00:00Z',
      user: { login: 'feedback-bot' },
    })
    expect(reporter.origin).toBe('reporter')
    expect(reporter.body.startsWith(REPORTER_MARKER)).toBe(false)
    expect(reporter.body).toContain('please fix')
    expect(reporter.id).toBe('10')

    const team = mapThreadMessage({
      id: 11,
      body: 'On it, shipping today',
      created_at: '2026-01-02T00:00:00Z',
      user: { login: 'maintainer' },
    })
    expect(team.origin).toBe('team')
    expect(team.author).toBe('maintainer')
    expect(team.body).toBe('On it, shipping today')
  })
})

describe('redact', () => {
  it('scrubs emails', () => {
    expect(redact('mail ada@example.com now')).toBe('mail [email] now')
  })

  it('scrubs github tokens, JWTs, and prefixed keys', () => {
    expect(redact('token github_pat_11ABCDEFG0hijklmnopqrstuvwxyz')).toBe('token [token]')
    expect(redact('jwt eyJhbGciOiJ.eyJzdWIiOiIx.SflKxwRJSMeKKF2QT4')).toBe('jwt [jwt]')
    expect(redact('key sk_notarealkeyjustfortests')).toBe('key [key]')
  })

  it('keeps the query key but redacts the value', () => {
    expect(redact('/cb?token=abc123&page=2')).toBe('/cb?token=[redacted]&page=2')
    expect(redact('/x?access_token=xyz')).toBe('/x?access_token=[redacted]')
  })

  it('redacts bearer authorization values', () => {
    expect(redact('Authorization: Bearer abcdef123456')).toBe('Authorization: Bearer [redacted]')
  })

  it('leaves innocuous text untouched', () => {
    expect(redact('click button "Save order"')).toBe('click button "Save order"')
  })
})

describe('parseBrowser', () => {
  it('identifies common browser/OS pairs', () => {
    expect(parseBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'))
      .toBe('Chrome on macOS')
    expect(parseBrowser('Mozilla/5.0 (Windows NT 10.0) Gecko/20100101 Firefox/121.0'))
      .toBe('Firefox on Windows')
    expect(parseBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'))
      .toBe('Safari on iOS')
  })

  it('checks Edge before Chrome (Edge UA contains Chrome)', () => {
    expect(parseBrowser('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0'))
      .toBe('Edge on Windows')
  })

  it('falls back gracefully', () => {
    expect(parseBrowser('')).toBe('unknown')
    expect(parseBrowser('SomeBot/1.0')).toBe('unknown browser on unknown OS')
  })
})

describe('formatEnvironment', () => {
  it('joins present fields with a middot, skips absent ones', () => {
    expect(formatEnvironment({ browser: 'Chrome on macOS', viewport: '1280x720', locale: 'en-US', online: true }))
      .toBe('Chrome on macOS · viewport 1280x720 · en-US · online')
    expect(formatEnvironment({ online: false })).toBe('offline')
    expect(formatEnvironment({})).toBe('')
  })
})

describe('formatBreadcrumbs', () => {
  const mk = (kind: Breadcrumb['kind'], text: string): Breadcrumb => ({ t: '2026-07-15T02:30:45.000Z', kind, text })

  it('renders a fenced timeline with time, padded kind, and text', () => {
    const out = formatBreadcrumbs([mk('click', 'button "Save"'), mk('fetch', 'GET /api/x → 500')])
    expect(out[0]).toBe('```')
    expect(out[out.length - 1]).toBe('```')
    expect(out[1]).toBe('02:30:45  click   button "Save"')
    expect(out[2]).toBe('02:30:45  fetch   GET /api/x → 500')
  })

  it('says so when empty', () => {
    expect(formatBreadcrumbs([])).toEqual(['_none captured_'])
  })
})

describe('buildBody diagnostics', () => {
  const base: CreateIssueArgs = {
    repo: 'o/r',
    token: 't',
    type: 'bug',
    message: 'It broke',
    labels: [],
    user: null,
    context: { url: 'https://app/x', ts: '2026-01-01T00:00:00Z' },
  }

  it('renders the environment line for any report', () => {
    const body = buildBody({ ...base, context: { ...base.context, environment: { browser: 'Chrome on macOS', viewport: '800x600' } } })
    expect(body).toContain('**Environment:** Chrome on macOS · viewport 800x600')
  })

  it('renders the activity trail for bugs and prefers it over legacy console errors', () => {
    const body = buildBody({
      ...base,
      context: { ...base.context, breadcrumbs: [{ t: '2026-07-15T02:30:45.000Z', kind: 'click', text: 'button "Save"' }], consoleErrors: ['legacy'] },
    })
    expect(body).toContain('**Recent activity:**')
    expect(body).toContain('button "Save"')
    expect(body).not.toContain('**Recent console errors:**')
    expect(body).not.toContain('legacy')
  })
})
