import type { H3Event } from 'h3'

/**
 * Playground stand-in for a host's identity hook. A real app would read its
 * session here (e.g. `getAuthSession(event)`) and return the logged-in user,
 * or `null` when anonymous. This must never throw.
 */
export default async function resolveUser(_event: H3Event) {
  return {
    id: 'playground-user-1',
    email: 'playground@floo.one',
    name: 'Playground User',
  }
}
