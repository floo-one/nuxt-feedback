import { describe, it, expect } from 'vitest'
import { buildReporter, buildTitle } from '../src/runtime/server/lib/github'

describe('github issue formatting', () => {
  it('prefixes the title by type and truncates the first line', () => {
    expect(buildTitle('bug', 'App crashes on save')).toBe('[Bug] App crashes on save')
    expect(buildTitle('feature', 'Dark mode\nplease')).toBe('[Feature] Dark mode')

    const long = 'x'.repeat(200)
    const title = buildTitle('feedback', long)
    expect(title.startsWith('[Feedback] ')).toBe(true)
    expect(title.endsWith('…')).toBe(true)
    expect(title.length).toBeLessThanOrEqual('[Feedback] '.length + 80)
  })

  it('formats the reporter from identity, falling back to anonymous', () => {
    expect(buildReporter(null)).toBe('anonymous')
    expect(buildReporter({ name: 'Ada', email: 'ada@example.com', id: 'u1' }))
      .toBe('Ada <ada@example.com> (id: u1)')
    expect(buildReporter(null, 'guest@example.com')).toBe('<guest@example.com>')
  })
})
