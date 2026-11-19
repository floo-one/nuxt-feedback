// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { getBreadcrumbs, installActivityBuffer } from '../src/runtime/utils/activityBuffer'
import { collectEnvironment } from '../src/runtime/utils/environment'
import { cssPath, describeElement, elementLabel, pickElement, stampedSources } from '../src/runtime/utils/elementPicker'

/**
 * Exercises the DOM-facing capture code against a simulated browser (happy-dom),
 * which the pure-logic tests in basic.test.ts can't reach. The activity buffer is
 * module-scoped and installs once, so these run in sequence and assert presence in
 * the accumulated trail rather than resetting between cases.
 */

describe('activityBuffer (DOM)', () => {
  beforeAll(() => {
    // Stub fetch so the wrapper has something to wrap and we control status. The
    // wrapper only reads `.ok`/`.status`, so a plain object stands in for Response.
    window.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const ok = String(input).includes('/ok')
      return { ok, status: ok ? 200 : 500 } as unknown as Response
    })
    installActivityBuffer()
  })

  it('captures a click with a target description', () => {
    const btn = document.createElement('button')
    btn.textContent = 'Save order'
    document.body.appendChild(btn)
    btn.click()
    const click = getBreadcrumbs().find(b => b.kind === 'click')
    expect(click?.text).toContain('button')
    expect(click?.text).toContain('Save order')
  })

  it('ignores clicks inside the feedback UI', () => {
    const root = document.createElement('div')
    root.id = 'floo-feedback-root'
    const inner = document.createElement('button')
    inner.textContent = 'Send'
    root.appendChild(inner)
    document.body.appendChild(root)

    const before = getBreadcrumbs().filter(b => b.kind === 'click').length
    inner.click()
    const after = getBreadcrumbs().filter(b => b.kind === 'click').length
    expect(after).toBe(before)
  })

  it('captures in-app navigations via pushState', () => {
    history.pushState({}, '', '/orders/42')
    const nav = getBreadcrumbs().find(b => b.kind === 'nav')
    expect(nav?.text).toBe('/orders/42')
  })

  it('records failed fetches (redacted), skips 200s and its own endpoints', async () => {
    await window.fetch('/api/data?token=secret123abc') // 500 → recorded, redacted
    await window.fetch('/ok') // 200 → not recorded
    await window.fetch('/api/__feedback/status?numbers=1') // own endpoint → skipped

    const fetches = getBreadcrumbs().filter(b => b.kind === 'fetch')
    expect(fetches.some(f => f.text.includes('/api/data') && f.text.includes('500'))).toBe(true)
    expect(fetches.some(f => f.text.includes('secret123abc'))).toBe(false)
    expect(fetches.some(f => f.text.includes('token=[redacted]'))).toBe(true)
    expect(fetches.some(f => f.text.includes('/ok'))).toBe(false)
    expect(fetches.some(f => f.text.includes('__feedback'))).toBe(false)
  })

  it('captures console.error', () => {
    console.error('boom', new Error('kaboom'))
    const entry = getBreadcrumbs().find(b => b.kind === 'console' && b.text.includes('kaboom'))
    expect(entry).toBeTruthy()
  })
})

describe('collectEnvironment (DOM)', () => {
  it('reads viewport, locale, timezone and a browser string', () => {
    const env = collectEnvironment()
    expect(env).toBeTruthy()
    expect(env!.viewport).toMatch(/^\d+x\d+$/)
    expect(typeof env!.timezone).toBe('string')
    expect(typeof env!.browser).toBe('string')
  })
})

describe('element picker (DOM)', () => {
  function mountPage() {
    document.body.innerHTML = `
      <main>
        <section id="plans">
          <h2>Plans</h2>
          <div><button>Starter</button><button>Pro <svg><path d="M0 0"/></svg></button></div>
          <div class="card"><h3 data-slot="title">Garden design</h3><img src="/g.jpg" alt=""><a href="/garden" aria-label=""><span class="absolute"></span></a></div>
        </section>
      </main>
      <div id="floo-feedback-root"><button>Send</button></div>`
  }

  it('builds a css path up to the nearest id, with nth-of-type for siblings', () => {
    mountPage()
    const pro = document.querySelectorAll('button')[1]!
    expect(cssPath(pro)).toBe('#plans > div:nth-of-type(1) > button:nth-of-type(2)')
  })

  it('describes text, section and link', () => {
    mountPage()
    const el = describeElement(document.querySelector('button')!)
    expect(el.tag).toBe('button')
    expect(el.section).toEqual({ id: 'plans', heading: 'Plans' })
    expect(elementLabel(el)).toBe('Button: "Starter"')
  })

  it('describes a pick on an empty card overlay link by the card', () => {
    mountPage()
    const el = describeElement(document.querySelector('a span')!)
    expect(el.href).toBe('/garden')
    expect(el.card?.title).toBe('Garden design')
    expect(elementLabel(el)).toBe('Card: "Garden design"')
  })

  it('picks on click, swallows it, and widens svg parts to the svg', async () => {
    mountPage()
    const pro = document.querySelectorAll('button')[1]!
    const pageClick = vi.fn()
    pro.addEventListener('click', pageClick)
    const picking = pickElement()
    document.querySelector('path')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    const picked = await picking
    expect(picked?.tagName.toLowerCase()).toBe('svg')
    expect(pageClick).not.toHaveBeenCalled()
    expect(document.querySelector('[data-feedback-ui]')).toBeNull()
  })

  it('reads build-stamped component files, innermost first, when Vue has no dev info', () => {
    document.body.innerHTML = `
      <div data-fb-src="app/pages/index.vue"><div data-fb-src="app/components/Card.vue"><button>Go</button></div></div>`
    const btn = document.querySelector('button')!
    expect(stampedSources(btn)).toEqual(['app/components/Card.vue', 'app/pages/index.vue'])
    expect(describeElement(btn).components).toEqual(['app/components/Card.vue', 'app/pages/index.vue'])
  })

  it('ignores the feedback UI and cancels on Escape', async () => {
    mountPage()
    const picking = pickElement()
    document.querySelector('#floo-feedback-root button')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(await picking).toBeNull()
  })
})
