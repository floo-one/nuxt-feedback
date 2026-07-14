/**
 * Best-effort client-side redaction for captured diagnostics.
 *
 * Breadcrumbs and environment data are scraped from live URLs, click targets,
 * and failed requests, so they can accidentally carry secrets (tokens in query
 * strings, emails, auth headers). This scrubs the obvious ones BEFORE anything
 * leaves the browser. It is a guardrail, not a guarantee — it targets common
 * shapes, not every possible secret.
 *
 * Pure and unit-tested. Order matters: emails and structured tokens first, then
 * key/value query params, so a token in a `?token=` param is caught by the
 * specific rule and not half-mangled by a generic one.
 */

const PATTERNS: Array<[RegExp, string]> = [
  // Emails.
  [/[\w.%+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]'],
  // GitHub tokens (classic + fine-grained PAT).
  [/\b(?:gh[posru]|github_pat)_\w{20,}\b/g, '[token]'],
  // JWTs (three base64url segments).
  [/\beyJ[\w-]{6,}\.[\w-]{6,}\.[\w-]{6,}\b/g, '[jwt]'],
  // Stripe-style and generic prefixed API keys (allow the live_/test_ segment).
  [/\b(?:sk|pk|rk|api)_\w{16,}\b/g, '[key]'],
  // Sensitive query/hash params: keep the key, redact the value.
  [
    /([?&#](?:token|key|api[_-]?key|secret|password|pwd|auth|access_token|refresh_token|session|sig|signature)=)[^&#\s]+/gi,
    '$1[redacted]',
  ],
  // Bearer / Basic authorization values.
  [/\b(bearer|basic)\s+[\w.~+/=-]{8,}/gi, '$1 [redacted]'],
]

/** Scrub common secret shapes from a captured string. Never throws. */
export function redact(input: string): string {
  let out = input
  for (const [re, replacement] of PATTERNS) {
    out = out.replace(re, replacement)
  }
  return out
}
