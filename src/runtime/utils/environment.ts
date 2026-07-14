/**
 * Client environment snapshot attached to every report.
 *
 * Always-on (not bug-only): viewport, screen, locale, timezone, online state,
 * and a human-readable browser/OS. Turns "it's broken on mobile" from a guess
 * into a fact. `parseBrowser` is pure and unit-tested; `collectEnvironment`
 * reads live `window`/`navigator` and returns `undefined` on the server.
 */
import type { FeedbackEnvironment } from '../types'

/**
 * Reduce a user-agent string to a short "Browser on OS" label. Deliberately
 * coarse — enough to route a repro, not fingerprint. Order matters: Edge and
 * Chrome both contain "Chrome"; Safari must be checked after Chrome.
 */
export function parseBrowser(ua: string): string {
  if (!ua) return 'unknown'

  let os = 'unknown OS'
  if (/windows/i.test(ua)) os = 'Windows'
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS'
  else if (/mac os x|macintosh/i.test(ua)) os = 'macOS'
  else if (/android/i.test(ua)) os = 'Android'
  else if (/linux/i.test(ua)) os = 'Linux'

  let browser = 'unknown browser'
  if (/edg[ae]?\//i.test(ua)) browser = 'Edge'
  else if (/opr\/|opera/i.test(ua)) browser = 'Opera'
  else if (/firefox\//i.test(ua)) browser = 'Firefox'
  else if (/chrome\/|crios\//i.test(ua)) browser = 'Chrome'
  else if (/safari\//i.test(ua)) browser = 'Safari'

  return `${browser} on ${os}`
}

/** Snapshot the current client environment. Returns `undefined` on the server. */
export function collectEnvironment(): FeedbackEnvironment | undefined {
  if (typeof window === 'undefined') return undefined
  const nav = window.navigator
  const env: FeedbackEnvironment = {}

  try {
    env.viewport = `${window.innerWidth}x${window.innerHeight}`
    if (window.screen) env.screen = `${window.screen.width}x${window.screen.height}`
    if (typeof window.devicePixelRatio === 'number') env.dpr = window.devicePixelRatio
    if (nav?.language) env.locale = nav.language
    env.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (typeof nav?.onLine === 'boolean') env.online = nav.onLine
    if (nav?.userAgent) env.browser = parseBrowser(nav.userAgent)
  }
  catch {
    // A flaky navigator/Intl must never break submission — return what we have.
  }

  return env
}
