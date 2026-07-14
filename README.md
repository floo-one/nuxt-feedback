# @floo-one/nuxt-feedback

A drop-in **in-app feedback dialog for Nuxt 4**. Your users press a shortcut, pick **Bug** or **Feedback**, and hit send:

- 🐞 **Bug** → your **Sentry** project (User Feedback), with the full error context — plus a **type** (crash / visual / data / performance) and a **severity** (critical → cosmetic). Falls back to a GitHub issue if Sentry isn't set up.
- 💬 **Feedback** → a **GitHub issue** on the repo you choose (ideas, praise, or anything else).

It's **auth-agnostic** (you give it a tiny function to identify the user — it never imports your auth), **Sentry is optional**, and when the user is already logged in it doesn't bother asking for their email.

---

## Requirements

- **Nuxt ≥ 4**
- **`@nuxt/ui` ≥ 4** (peer dependency — the dialog is built from Nuxt UI components your app already has)
- *Optional:* **`@sentry/node`** for the bug → Sentry route. Any app already using `@sentry/nuxt` has this; if it's absent, bugs just go to GitHub instead.

---

## Setup (3 steps)

### 1. Install

```bash
pnpm add @floo-one/nuxt-feedback
```

### 2. Register and configure it

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@floo-one/nuxt-feedback'],

  feedback: {
    github: { repo: 'your-org/your-repo' }, // where issues are filed
    shortcut: 'g-f',                         // press g then f
    sentry: true,                            // send bugs to your Sentry (set false to disable)
    resolveUserPath: './server/feedback-user.ts',
  },
})
```

### 3. Tell it who the user is

Create the file you referenced in `resolveUserPath`. It runs **on the server**, gets the request `event`, and returns the logged-in user (or `null`). Use whatever auth your app already has — the module never touches it.

```ts
// server/feedback-user.ts
import type { H3Event } from 'h3'

export default async function resolveUser(event: H3Event) {
  const session = await getServerSession(event) // ← however your app reads the session
  return session?.user
    ? { id: session.user.id, email: session.user.email, name: session.user.name }
    : null
}
```

> Must never throw — return `null` when logged out. When it returns a user, the dialog **hides the email field** and attaches their identity to the report automatically. (Omit `resolveUserPath` entirely to always-anonymous + ask for an email.)

That's it. The dialog auto-mounts everywhere — press **`g` then `f`**, or open it from code:

```ts
const { open } = useFeedback()
open()          // last-used type
open('bug')     // or 'feature' (the Feedback tab)
```

---

## Environment variables

Only **one** secret is needed — the GitHub token:

| Variable | Required | What it's for |
| --- | --- | --- |
| `NUXT_GITHUB_TOKEN` | **Yes** (for ideas + the bug fallback) | A GitHub token the server uses to create issues. Read from `runtimeConfig` — **never** exposed to the browser. |

**Bug → Sentry uses your app's existing `@sentry/nuxt` setup** (the DSN you already configure, e.g. `NUXT_PUBLIC_SENTRY_DSN`). The module adds **no** Sentry env of its own — it reuses the client your app already initialises.

**Getting the GitHub token** — create a [fine-grained PAT](https://github.com/settings/personal-access-tokens/new) scoped to **only your target repo** with **Issues: Read and write**, then:

```bash
# .env (local — git-ignored, never commit a real token)
NUXT_GITHUB_TOKEN=github_pat_xxxxxxxx
```

In production, set `NUXT_GITHUB_TOKEN` in your host's secret store (Coolify / Vercel / etc.) and redeploy. (No org-restricted PATs? A classic token with the `repo` scope works too.)

---

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `github.repo` | `string` | — | **Required.** Target repo for issues, `"owner/name"`. |
| `shortcut` | `string` | `'g-f'` | Keybind in [Nuxt UI `defineShortcuts`](https://ui.nuxt.com/composables/define-shortcuts) syntax. Pick one that doesn't clash with your app's chords. |
| `sentry` | `boolean` | `true` | Send bugs to the host Sentry SDK. `false` → bugs go to GitHub. |
| `github.labels.feature` | `string` | `'enhancement'` | Label for feedback issues. (Bug fallbacks use `bug`.) |
| `resolveUserPath` | `string` | — | Path to your identity hook (see step 3). Omit for always-anonymous. |
| `enabled` | `boolean` | `true` | Turn the whole thing off (e.g. per-environment). |

> The GitHub token is **never** an option — it lives only in `runtimeConfig` (`NUXT_GITHUB_TOKEN`) and never reaches the client bundle, responses, or logs.

---

## How it routes

```
bug      → Sentry (captureFeedback)  ──(Sentry missing/off)──▶  GitHub issue (label: bug)
           carries type     (crash | visual | data | performance)
           and     severity (critical | blocking | annoying | cosmetic)
feedback → GitHub issue (label: enhancement)
```

> **Prefixed label scheme** (opt in by setting any `github.labels.*Prefix` or `base`):
> issues get `<base>` + `type:<bug|idea>` + `app:<bucket>`, and bugs
> also get `severity:<level>` + `category:<kind>`.

A report is never silently dropped, and submit failures return a clean error toast (no provider internals leak to the client).

---

## Drop it into a repo with one prompt

Paste this into an AI coding agent (Claude Code, Cursor, …) **inside the target Nuxt 4 repo**:

```text
Integrate the npm package @floo-one/nuxt-feedback into this Nuxt 4 app.

1. Install it: `pnpm add @floo-one/nuxt-feedback`. It needs @nuxt/ui v4 as a peer —
   confirm this app already uses @nuxt/ui (it should).
2. In nuxt.config.ts: add '@floo-one/nuxt-feedback' to `modules`, and add a `feedback`
   block with:
     - github.repo: the "owner/name" of THIS app's GitHub repo (find it from the git remote)
     - shortcut: 'g-f' — but first grep the codebase for existing `defineShortcuts` chords
       and pick a non-colliding one if g-f is taken
     - sentry: true only if this app already runs @sentry/nuxt, otherwise false
     - resolveUserPath: './server/feedback-user.ts'
3. Create server/feedback-user.ts that default-exports
   `async (event: H3Event) => ({ id, email, name }) | null`. Wire it to THIS app's existing
   auth — find how the app reads its session/user on the server and use that. Return null
   when logged out; it must never throw.
4. Add `NUXT_GITHUB_TOKEN` to .env.example with a comment: server-only, a GitHub token with
   "Issues: write" on the repo. Do NOT put a real token anywhere in the code or config —
   I'll set the real value in the host's secret store.
5. Verify: `nuxt typecheck` (or build) passes, and the dialog opens with the shortcut.
   Report what you changed and what I still need to do (set NUXT_GITHUB_TOKEN).

Hard rule: the GitHub token is a secret. Read it only via runtimeConfig (NUXT_GITHUB_TOKEN);
never a public option, never committed, never in the client bundle.
```

---

## Develop this module

```bash
pnpm install
pnpm dev          # run the playground
pnpm lint && pnpm test && pnpm test:types
pnpm prepack      # build the distributable
```

## License

MIT
