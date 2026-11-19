# @floo-one/nuxt-feedback

A drop-in **in-app feedback dialog for Nuxt 4**. Your users press a shortcut, pick **Bug** or **Feedback**, and hit send:

- 🐞 **Bug** → a **GitHub issue** (labelled `bug`) with the full context — reporter, page URL, app build, recent console errors — plus a **type** (crash / visual / data / performance) and a **severity** (critical → cosmetic).
- 💬 **Feedback** → a **GitHub issue** on the repo you choose (ideas, praise, or anything else).
- 🎯 **Point at it** → the shortcut starts an element picker. The reporter clicks what they mean (up to five elements), and the issue lists each one with a cropped screenshot, its text, CSS selector, section, link and the component file that renders it.
- 🧷 **Docked panel** → the panel sits in the corner, so the page and the numbered outlines of the picked elements stay visible while the reporter writes.

It's **auth-agnostic** (you give it a tiny function to identify the user — it never imports your auth), and when the user is already logged in it doesn't bother asking for their email.

---

## Requirements

- **Nuxt ≥ 4**
- **`@nuxt/ui` ≥ 4** (peer dependency — the dialog is built from Nuxt UI components your app already has)

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
pick()          // go straight to the element picker, then the panel
```

### Pointing at an element

The shortcut (default **`g` then `f`**) starts the picker: whatever is under the
pointer gets a red outline, a click picks it, **Esc** opens the panel without one.
The click is swallowed, so links and buttons don't fire. In the panel, **Point at
another element** adds more (up to five); each stays outlined on the page with its
number. The issue gets one block per element, above the fold:

```md
**Element 1:**

- **What:** `<button>` "Buy now"
- **Selector:** `#plans > div:nth-of-type(2) > button`
- **Contains:** `app/components/PriceTag.vue`, `app/components/Badge.vue`
- **Inside:** `app/components/PricingCard.vue`
- **Section:** "Plans" `#plans`
- **Link:** `/checkout`

![Element 1](https://github.com/acme/feedback-assets/blob/main/shop/2026-11/3f2a9c1e-element-1.jpg?raw=true)
```

**Contains** lists the component files rendered inside the picked element, in page
order: mark a whole area and it names everything in it, which is usually where the
problem is. **Inside** is the component chain around the element.

**Component files** come from Vue in dev builds. For production builds, set
`sourceAttribute: true`: each of your components' outermost elements get a
`data-fb-src="app/components/PricingCard.vue"` attribute at build time, which the
picker reads. The paths are visible in your page HTML, so use it for internal apps.

**Screenshots** are committed to a separate private repo (default
`<owner>/feedback-assets`), not your app repo, so they never trigger CI or deploys.
Create that repo once per owner and give the token **Contents: read and write** on
it. A failed upload files the issue without the image. A bug with nothing picked
gets a screenshot of the visible page instead.

**Build commit:** when `SOURCE_COMMIT` is set (Coolify sets it), the server stamps
it on every report and the issue links to that commit. To have it at build time
too, declare `ARG SOURCE_COMMIT` in your Dockerfile's build stage.

---

## Environment variables

Only **one** secret is needed — the GitHub token:

| Variable | Required | What it's for |
| --- | --- | --- |
| `NUXT_GITHUB_TOKEN` | **Yes** | A GitHub token the server uses to create issues (bugs and ideas). Read from `runtimeConfig` — **never** exposed to the browser. |

**Getting the GitHub token** — create a [fine-grained PAT](https://github.com/settings/personal-access-tokens/new) scoped to your target repo with **Issues: Read and write**, plus your `feedback-assets` repo with **Contents: Read and write** (for screenshots), then:

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
| `shortcut` | `string` | `'g-f'` | Starts the element picker; the panel opens on the pick. Keybind in [Nuxt UI `defineShortcuts`](https://ui.nuxt.com/composables/define-shortcuts) syntax. Pick one that doesn't clash with your app's chords. |
| `github.labels.feature` | `string` | `'enhancement'` | Label for feedback issues. (Bugs use `bug`.) |
| `resolveUserPath` | `string` | — | Path to your identity hook (see step 3). Omit for always-anonymous. |
| `resolveAppPath` | `string` | — | Path to a hook mapping a submission to an "app bucket" (used for the `app:` label). Omit to fall back to `context.app`. |
| `onSubmitPath` | `string` | — | Path to a hook run **server-side after** a report is filed — notifications, logging, tracking. Receives `(report, result)`; a throw is caught and ignored. See below. |
| `screenshots` | `boolean` | `true` | Attach a cropped screenshot per picked element (or of the page). Off when no assets repo can be derived. |
| `github.assetsRepo` | `string` | `'<owner>/feedback-assets'` | Private repo the screenshots are committed to. |
| `sourceAttribute` | `boolean` | `false` | Stamp your components' file paths into production HTML so reports name the file. |
| `requireUser` | `boolean` | `false` | Only identified users (your `resolveUserPath` hook returns a user) get the shortcut and dialog; the server answers anonymous reports with 401. |
| `enabled` | `boolean` | `true` | Turn the whole thing off (e.g. per-environment). |

> The GitHub token is **never** an option — it lives only in `runtimeConfig` (`NUXT_GITHUB_TOKEN`) and never reaches the client bundle, responses, or logs.

---

## How it routes

```
bug      → GitHub issue (label: bug)
           carries type     (crash | visual | data | performance)
           and     severity (critical | blocking | annoying | cosmetic)
feedback → GitHub issue (label: enhancement)
```

> **Prefixed label scheme** (opt in by setting any `github.labels.*Prefix` or `base`):
> issues get `<base>` + `type:<bug|idea>` + `app:<bucket>`, and bugs
> also get `severity:<level>` + `category:<kind>`.

A report is never silently dropped, and submit failures return a clean error toast (no provider internals leak to the client).

### React to submissions (`onSubmitPath`)

Point `onSubmitPath` at a server file to run your own code after each report is
filed — ping Slack, write to a DB, track it for a "my reports" view. It runs
**after** the GitHub issue is created and never blocks the user's submission (a
throw is caught and logged).

```ts
// server/feedback-submit.ts
export default async function onSubmit(report, result) {
  // report: { type, message, severity?, category?, user, email?, app, labels, context? }
  // result: { channel: 'github', issue: { number, url } }
  await fetch(process.env.SLACK_WEBHOOK!, {
    method: 'POST',
    body: JSON.stringify({ text: `New ${report.type}: ${result.issue.url}` }),
  })
}
```

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

## Host the dashboard (live demo)

The repo ships a [Dockerfile](Dockerfile) that builds the [dashboard](dashboard) app — today a self-contained demo site with the module installed on a real page (dialog and API routes fully working), and long-term the dashboard for triaging the issues the module files.

On **Coolify**: create an application from this repo, pick the **Dockerfile** build pack (port `3000`), and set one env var:

| Variable | Value |
| --- | --- |
| `NUXT_GITHUB_TOKEN` | A GitHub token with **Issues: write** on the repo demo submissions should land in (the dashboard targets `floo-one/nuxt-feedback`). |

Without the token the site still runs and the dialog opens — submits just fail with an error toast.

Or locally:

```bash
docker build -t nuxt-feedback-demo .
docker run -p 3000:3000 -e NUXT_GITHUB_TOKEN=github_pat_xxx nuxt-feedback-demo
```

---

## Develop this module

```bash
pnpm install
pnpm dev          # run the dashboard app locally
pnpm lint && pnpm test && pnpm test:types
pnpm prepack      # build the distributable
```

## License

MIT
