/**
 * Client-side console-error ring buffer.
 *
 * Installed once by the client plugin; the dialog reads it to attach recent
 * errors to bug reports. Single module instance per client bundle, so the buffer
 * is an ordinary module-scoped array. No-op on the server.
 */

const MAX_ENTRIES = 20
const MAX_LEN = 500

const buffer: string[] = []
let installed = false

function push(entry: string): void {
  buffer.push(entry.length > MAX_LEN ? `${entry.slice(0, MAX_LEN - 1)}…` : entry)
  if (buffer.length > MAX_ENTRIES) buffer.shift()
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

/**
 * Start capturing: wrap `console.error` and listen for uncaught errors and
 * unhandled promise rejections. Idempotent and client-only.
 */
export function installConsoleBuffer(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  const original = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    try {
      push(args.map(format).join(' '))
    }
    catch {
      // Never let capture break the host's logging.
    }
    original(...args)
  }

  window.addEventListener('error', (e: ErrorEvent) => {
    push(`[error] ${e.message}${e.filename ? ` (${e.filename}:${e.lineno})` : ''}`)
  })
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    push(`[unhandledrejection] ${format(e.reason)}`)
  })
}

/** Snapshot of the captured errors, oldest first. */
export function getConsoleErrors(): string[] {
  return [...buffer]
}
