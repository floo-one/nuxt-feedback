import { describe, it, expect } from 'vitest'
import { buildBody, buildLabels, buildReporter, buildTitle } from '../src/runtime/server/lib/github'
import type { CreateIssueArgs } from '../src/runtime/server/lib/github'
import type { LabelConfig } from '../src/runtime/types'

const legacyConfig: LabelConfig = {
  bug: 'bug',
  feature: 'enhancement',
  prefixed: false,
  base: 'feedback',
  typePrefix: 'type:',
  appPrefix: 'app:',
  severityPrefix: 'severity:',
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

  it('legacy scheme ignores app and severity', () => {
    expect(buildLabels({ type: 'bug', app: 'booking', severity: 'blocking', config: legacyConfig }))
      .toEqual(['bug'])
  })

  it('prefixed scheme emits base + type + app + severity for a bug', () => {
    expect(buildLabels({ type: 'bug', app: 'booking', severity: 'blocking', config: prefixedConfig }))
      .toEqual(['feedback', 'type:bug', 'app:booking', 'severity:blocking'])
  })

  it('prefixed scheme maps feature to type:idea and omits severity', () => {
    expect(buildLabels({ type: 'feature', app: 'sales', severity: 'blocking', config: prefixedConfig }))
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

  it('renders resolved app, severity, version for a bug', () => {
    const body = buildBody({
      ...base,
      app: 'booking',
      context: { ...base.context, severity: 'blocking', version: 'abc123' },
    })
    expect(body).toContain('**App:** booking')
    expect(body).toContain('**Severity:** blocking')
    expect(body).toContain('**Version:** abc123')
    expect(body).toContain('**Reporter:** Ada <ada@x.io> (id: u1)')
  })

  it('renders a fenced console-error block, and "none captured" when empty', () => {
    const withErrors = buildBody({ ...base, context: { ...base.context, consoleErrors: ['TypeError: x'] } })
    expect(withErrors).toContain('**Recent console errors:**')
    expect(withErrors).toContain('```')
    expect(withErrors).toContain('TypeError: x')

    const empty = buildBody({ ...base, context: { ...base.context, consoleErrors: [] } })
    expect(empty).toContain('_none captured_')
  })

  it('omits severity and console block for feature submissions', () => {
    const body = buildBody({
      ...base,
      type: 'feature',
      context: { ...base.context, severity: 'blocking', consoleErrors: ['x'] },
    })
    expect(body).not.toContain('**Severity:**')
    expect(body).not.toContain('Recent console errors')
  })
})
