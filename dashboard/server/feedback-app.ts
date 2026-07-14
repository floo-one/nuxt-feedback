import type { H3Event } from 'h3'

/**
 * Dashboard stand-in for a host's app-bucket hook. A real multi-app host maps
 * the page path (from `context.url`) to a bucket — e.g. `/booking/*` → 'booking'.
 * Returns `null` to fall back to `context.app`. This must never throw.
 */
export default async function resolveApp(
  _event: H3Event,
  context?: { url?: string },
): Promise<string | null> {
  const path = context?.url ? new URL(context.url).pathname : ''
  if (path.startsWith('/booking')) return 'booking'
  if (path.startsWith('/sales')) return 'sales'
  return 'dashboard'
}
