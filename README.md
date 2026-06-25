# @floo-one/nuxt-feedback

An in-app feedback dialog for **Nuxt 4**, triggered by a keyboard shortcut. A user picks a type and submits:

- 🐞 **Bug** → forwarded to **Sentry** (User Feedback API), falling back to a GitHub issue if Sentry isn't available
- 💡 **Feature request** → created as a **GitHub Issue**
- 💬 **General feedback** → created as a **GitHub Issue**

It is **auth-agnostic** (you supply a server-side `resolveUser` hook — the module never imports your auth), and **Sentry is an optional peer dependency** that's detected at runtime, so the bug route degrades gracefully when it's absent.

## Requirements

- Nuxt `>= 4.0.0`
- `@nuxt/ui` `>= 4.0.0` (peer dependency — the dialog uses Nuxt UI v4 components)
- _(optional)_ `@sentry/node` for the bug → Sentry route (any host already using `@sentry/nuxt` has this)

## Install

This package is distributed as a local workspace link (not published yet). In a consumer app:

```jsonc
// package.json
{
  "dependencies": {
    "@floo-one/nuxt-feedback": "file:../path/to/nuxt-feedback"
  }
}
```

```bash
pnpm install
```

Then register it:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@floo-one/nuxt-feedback'],

  feedback: {
    shortcut: 'g-f',
    github: { repo: 'your-org/your-repo' },
    sentry: true,
    resolveUserPath: './server/feedback-user.ts',
  },
})
```

That's it — a `<FeedbackDialog>` is auto-mounted once, and pressing the shortcut (`g` then `f`) opens it. You can also open it programmatically from anywhere:

```ts
const { open } = useFeedback()
open('bug') // or 'feature' | 'feedback'; omit to keep the last type
```

## Module options

| Option            | Type                                          | Default                                       | Description                                                                                              |
| ----------------- | --------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `shortcut`        | `string`                                      | `'g-f'`                                        | Keybind in [Nuxt UI `defineShortcuts`](https://ui.nuxt.com/composables/define-shortcuts) syntax. Choose one that doesn't collide with the host's chords. |
| `github.repo`     | `string`                                      | `''`                                           | Target repo for issues, as `"owner/name"`. Required for feature/feedback (and the bug fallback).         |
| `github.labels`   | `{ feature?: string, feedback?: string }`     | `{ feature: 'enhancement', feedback: 'feedback' }` | Labels applied to created issues. (The bug fallback always uses the `bug` label.)                  |
| `sentry`          | `boolean`                                     | `true`                                         | `true` auto-detects the host's server Sentry SDK for bugs; `false` disables it (bugs go straight to GitHub). |
| `resolveUserPath` | `string`                                      | _unset_                                        | Path (relative to the project root) to a host file that resolves reporter identity. See below.           |
| `enabled`         | `boolean`                                     | `true`                                         | Disable the module entirely (e.g. per-environment).                                                      |

> **Security:** the GitHub token is **never** a module option. It's read from private `runtimeConfig` only (see env vars). It never reaches the client bundle and never appears in API responses or logs.

## Environment variables

| Variable            | Where                | Description                                                                                              |
| ------------------- | -------------------- | -------------------------------------------------------------------------------------------------------- |
| `NUXT_GITHUB_TOKEN` | **server-only**      | A fine-grained GitHub PAT scoped to the target repo with **`Issues: write`** permission. Read via `runtimeConfig.githubToken`. Set it in your hosting platform's secret store (e.g. the Coolify UI) — never commit it. |

For consumers that already run Sentry via `@sentry/nuxt`, no extra Sentry env is needed: the module reuses the host's already-initialised server Sentry client in-process.

## The `resolveUser` contract

The module is **auth-agnostic**. To attach reporter identity, point `resolveUserPath` at a file that **default-exports** an async function `(event) => ({ id, email, name } | null)`. It runs server-side, receives the H3 `event`, and must **never throw** (return `null` for anonymous/logged-out users).

```ts
// server/feedback-user.ts
import type { H3Event } from 'h3'

export default async function resolveUser(event: H3Event) {
  // Use whatever auth your app already has — the module never imports it.
  const session = await getAuthSession(event) // example: better-auth, auto-imported
  return session?.user
    ? { id: session.user.id, email: session.user.email, name: session.user.name }
    : null
}
```

- The returned identity is attached to the GitHub issue body and to the Sentry feedback (`name`/`email`).
- When `resolveUserPath` is unset, identity resolves to `null` and reports are filed as `anonymous`.
- The optional email field in the dialog is a fallback contact for anonymous users; resolved identity always takes precedence.

## How it behaves

- **Trigger:** a client plugin registers the shortcut and mounts a single `<FeedbackDialog>` into `<body>`, reusing the Nuxt app context so its toasts surface through your existing `<UApp>` toaster.
- **Submit:** `POST /api/__feedback` with `{ type, message, email?, context }`. The body is validated with **zod** (required, non-empty, ≤ 5000 chars).
- **Routing:**
  - `bug` → Sentry (`captureFeedback`, falling back to `captureMessage` on older SDKs). If `@sentry/node` is missing, disabled, or not initialised, the bug is filed as a **GitHub issue labelled `bug`** instead — a report is never silently dropped.
  - `feature` / `feedback` → a GitHub issue (raw REST via `$fetch`, no Octokit).
- **Failures** return a clean `{ ok: false }` with a `502`-class status; details are logged server-side only.

## Per-app integration guide

1. **Add the dependency** (local link until published):
   ```jsonc
   // apps/web/package.json
   { "dependencies": { "@floo-one/nuxt-feedback": "file:../../path/to/nuxt-feedback" } }
   ```
   then `pnpm install`.
2. **Register and configure** the module in `nuxt.config.ts` (`modules` + the `feedback` key). Pick a `shortcut` that doesn't collide with existing `defineShortcuts` chords in your app.
3. **Create the identity hook** at the path you set in `resolveUserPath` (see the contract above). Wire it to your app's existing auth; return `null` when logged out; never throw.
4. **Set the secret:** add `NUXT_GITHUB_TOKEN` to `.env.example` (documented as server-only) and inject the real value via your hosting platform's secret store.
5. **Verify:**
   - the shortcut opens the dialog and a submit shows a success toast;
   - a **feature/feedback** submit creates a GitHub issue in the configured repo with the right label;
   - a **bug** submit appears as User Feedback in your Sentry project (or, with Sentry removed, falls back to a GitHub issue labelled `bug` — no 500).

## Local development

```bash
pnpm install
pnpm dev:prepare   # generate type stubs
pnpm dev           # run the playground
pnpm dev:build     # production-build the playground
pnpm lint
pnpm test          # vitest
pnpm test:types    # vue-tsc (module + playground)
pnpm prepack       # build the distributable module
```

## License

MIT
