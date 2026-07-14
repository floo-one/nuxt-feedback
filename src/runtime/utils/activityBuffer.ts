/**
 * Client-side activity breadcrumb trail.
 *
 * A single ring buffer of recent user activity — clicks, in-app navigations,
 * failed network requests, and console errors — so a bug report carries the
 * timeline that led up to it, not just the final error. Installed once by the
 * client plugin; the dialog reads it for bug submissions.
 *
 * Every entry is passed through `redact` on capture, so secrets never even reach
 * the buffer. No-op on the server. The buffer is a module-scoped array (one
 * instance per client bundle).
 */
import { redact } from './redact'
import type { Breadcrumb } from '../types'

const MAX_ENTRIES = 30
const MAX_LEN = 300

const buffer: Breadcrumb[] = []
let installed = false

function push(kind: Breadcrumb['kind'], text: string): void {
  try {
    const clean = redact(text)
    buffer.push({
      t: new Date().toISOString(),
      kind,
      text: clean.length > MAX_LEN ? `${clean.slice(0, MAX_LEN - 1)}…` : clean,
    })
    if (buffer.length > MAX_ENTRIES) buffer.shift()
  }
  catch {
    // Capture must never break the host app.
  }
}

function format(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return `${value.name}: ${value.message}`
  try {
    return JSON.stringify(value)
  }
  catch {
    return String(value)
  }
}

/** A compact, human description of a click target. */
function describeTarget(el: Element | null): string {
  if (!el) return 'unknown'
  const tag = el.tagName.toLowerCase()
  const id = el.id ? `#${el.id}` : ''
  const label
    = el.getAttribute('aria-label')
      || (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)
  return `${tag}${id}${label ? ` "${label}"` : ''}`
}

/** Path (+ search) of a URL, resolved against the current origin. */
function pathOf(url: string): string {
  try {
    const u = new URL(url, window.location.href)
    return u.pathname + u.search
  }
  catch {
    return url
  }
}

/** The module's own endpoints — never record these (poll noise + recursion). */
function isOwnEndpoint(url: string): boolean {
  return url.includes('/api/__feedback')
}

/**
 * Start capturing activity: console errors, uncaught errors, rejections,
 * clicks, history navigations, and failed fetches. Idempotent and client-only.
 */
export function installActivityBuffer(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  // ---- Console + uncaught errors ----------------------------------------
  const original = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    push('console', args.map(format).join(' '))
    original(...args)
  }
  window.addEventListener('error', (e: ErrorEvent) => {
    push('console', `[error] ${e.message}${e.filename ? ` (${e.filename}:${e.lineno})` : ''}`)
  })
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    push('console', `[unhandledrejection] ${format(e.reason)}`)
  })

  // ---- Clicks ------------------------------------------------------------
  window.addEventListener(
    'click',
    (e: MouseEvent) => {
      const target = e.target as Element | null
      const el = target?.closest?.('button,a,[role="button"],input,select,textarea,label') || target
      // Ignore clicks inside the feedback UI itself.
      if (el && (el as Element).closest?.('#floo-feedback-root,#floo-feedback-history-root')) return
      push('click', describeTarget(el))
    },
    { capture: true },
  )

  // ---- In-app navigations (history API + back/forward) -------------------
  const recordNav = (url: string) => push('nav', pathOf(url))
  const wrapHistory = (fn: History['pushState']): History['pushState'] =>
    function (this: History, ...args: Parameters<History['pushState']>) {
      const result = fn.apply(this, args)
      if (args[2] != null) recordNav(String(args[2]))
      return result
    }
  history.pushState = wrapHistory(history.pushState)
  history.replaceState = wrapHistory(history.replaceState)
  window.addEventListener('popstate', () => recordNav(window.location.href))

  // ---- Failed fetches ----------------------------------------------------
  const originalFetch = window.fetch?.bind(window)
  if (originalFetch) {
    window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
      const [input, init] = args
      const url = typeof input === 'string' ? input : (input as Request).url ?? String(input)
      const method = (init?.method || (typeof input !== 'string' ? (input as Request).method : '') || 'GET').toUpperCase()
      try {
        const res = await originalFetch(...args)
        if (!res.ok && !isOwnEndpoint(url)) push('fetch', `${method} ${pathOf(url)} → ${res.status}`)
        return res
      }
      catch (err) {
        if (!isOwnEndpoint(url)) push('fetch', `${method} ${pathOf(url)} → failed`)
        throw err
      }
    }
  }
}

/** Snapshot of the captured breadcrumbs, oldest first. */
export function getBreadcrumbs(): Breadcrumb[] {
  return [...buffer]
}
