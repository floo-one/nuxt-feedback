import { describe, it, expect } from 'vitest'
import { REPORTER_MARKER, buildBody, buildCommentBody, buildLabels, buildReporter, buildTitle, mapThreadMessage, parseIssueNumbers } from '../src/runtime/server/lib/github'
import type { CreateIssueArgs } from '../src/runtime/server/lib/github'
import { applyStates, capSubmissions, hasUnread } from '../src/runtime/utils/submissionStore'
import type { LabelConfig, StoredSubmission } from '../src/runtime/types'

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
