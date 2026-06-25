# Master Prompt — Build `@floo-one/nuxt-feedback` (standalone Nuxt module)

> Hand this entire file to a Claude agent. It is the implementation brief for v0.1.
> Scope: a 1-week, one-engineer **walking skeleton** — every layer working end-to-end on the
> narrowest path. Build all **P0** before touching anything under "Out of scope".

---

## Mission
Build a **standalone, reusable Nuxt module** — published under the **`floo-one`** scope
(`@floo-one/nuxt-feedback`, GitHub repo `floo-one/nuxt-feedback`) — that adds an in-app
feedback dialog triggered by a keyboard shortcut. A user submits one of:

- **bug** → forwarded to **Sentry** (User Feedback API)
- **feature request** → created as a **GitHub Issue**
- **general feedback** → created as a **GitHub Issue**

It must be drop-in installable in *any* Nuxt 4 app. Prove it standalone (in the module's own
`playground/`) and then against a real app (GLE Booking-Dashboard) as **consumer #1**.

---

## Where to develop it (NEW standalone folder — NOT inside any GLE repo)
- Create a brand-new directory and git repo at:
  **`/Users/floo/Documents/Coding/floo-one/nuxt-feedback/`**
  (new top-level `floo-one/` scope folder, sibling to `_GlobalLawExperts/`). This file already
  lives there.
- It is fully self-contained: its own `package.json`, git history, build, and `playground/`.
  It must **not** import from or depend on any GLE project.

---

## Target consumers & reference projects (read-only — for conventions, not to copy code into)
All live under `/Users/floo/Documents/Coding/_GlobalLawExperts/`. All are **Nuxt 4**.
The module must work across both shapes below, so design for portability, not for one app:

- **Layered monorepos** (extend layers, pnpm + Turbo): `Booking-Dashboard`, `GLE-Internal`,
  `GLE-Website`, `GLE-backend`, `GLE-frontend`.
- **Single-app Nuxt 4**: `Leads-Dashboard`, `Sales-Dashboard`, `GLE-AI`, `LegalWebsite-SEO`.
- **Edge (do not validate this sprint):** `Domain-Standardizer` (nuxt-nightly 5) — just don't
  design anything that would obviously break on Nuxt 5.

**Consumer #1 / reference implementation = `Booking-Dashboard`**
(`/Users/floo/Documents/Coding/_GlobalLawExperts/Booking-Dashboard`). Read it to learn the
conventions you must support, then wire the module into it for the real-world e2e proof. Skim
one single-app dashboard (e.g. `Sales-Dashboard`) to confirm the install works without layers.

### What to learn from Booking-Dashboard (verify against the real code — don't trust blindly)
- Nuxt **4.0.0**, Nuxt UI **4.6.1** (`packages/layer-core`), `@vueuse/nuxt` 14.x, pnpm 10.x, Turbo.
- `@sentry/nuxt` **10.59.0** (`apps/web/sentry.client.config.ts`, `apps/web/sentry.server.config.ts`,
  wired in `apps/web/nuxt.config.ts`). Org `globallawexperts`, project `gle-bookings`,
  **EU region** (`de.sentry.io`), public DSN via `NUXT_PUBLIC_SENTRY_DSN`.
- GitHub repo for *its* issues: `globallawexperts/GLE-Bookings`.
- Modal pattern to mirror: `UModal` + `defineModel('open', { type: Boolean })`
  (`ConfirmationModal.vue` in layer-core; also `SettingsModal.vue`, `QuoteActionModal.vue`).
- Shortcuts: Nuxt UI `defineShortcuts()` in `packages/layer-booking/app/layouts/dashboard.vue`,
  defined in `.../composables/useDashboardNavigation.ts`.
  **Taken keys:** `g-a g-b g-i g-o g-s` and `n`. Your default must not collide.
- Server pattern: `defineEventHandler` + `readValidatedBody(event, schema.parse)`; identity via
  better-auth in `packages/layer-auth/server/utils/auth.ts` (`requireAuth`, `getAuthSession`);
  client identity via `useAuth()` (`packages/layer-auth/app/composables/useAuth.ts`).
- Deploy: Docker (distroless) on Coolify; runtime env injected via the Coolify UI; secrets
  documented in `.env.example`.
- Respect Nuxt UI v4 gotchas (UFieldGroup, UTable `@select`) and the navy dashboard theme.

---

## Locked decisions (do not relitigate)
1. **Packaging:** standalone Nuxt module via `@nuxt/module-builder` — `defineNuxtModule` with typed
   options + a `playground/` app. Name `@floo-one/nuxt-feedback`. **Publishing to a registry is out
   of scope this sprint**; validate via the playground and a local link into Booking-Dashboard.
2. **Identity is auth-agnostic:** the module **never** imports any app's auth (no better-auth). The
   host supplies a server-side `resolveUser(event)` hook. Default = returns `null`.
3. **Sentry is an OPTIONAL peer dependency:** detect/use the host's Sentry SDK at runtime via a
   guarded dynamic import. If absent, the bug route degrades gracefully (no crash).
4. **GitHub destination = Issues (REST)** this version. Projects v2 boards are out of scope.

---

## File manifest (in `floo-one/nuxt-feedback/`)
```
package.json            # name "@floo-one/nuxt-feedback", module-builder scripts, peerDeps
src/module.ts           # defineNuxtModule: options, addComponent, addPlugin, addImports,
                        #   addServerHandler, resolveUser virtual, runtimeConfig, Sentry detect
src/runtime/components/FeedbackDialog.vue
src/runtime/composables/useFeedback.ts        # open()/close() + submit() -> POST
src/runtime/plugin.ts                          # registers shortcut, auto-mounts dialog (Teleport)
src/runtime/server/api/feedback.post.ts        # validated POST: resolveUser -> route by type
src/runtime/server/lib/github.ts               # create issue via REST ($fetch, no octokit)
src/runtime/server/lib/sentry.ts               # guarded dynamic import + capture
playground/            # Nuxt 4 app; configure it to MIRROR a GLE app (a fake resolveUser + a test
                        #   GitHub repo) so it doubles as the integration template
README.md              # install, options, resolveUser contract, env vars, per-app integration guide
```

---

## Public API — module options
```ts
export interface ModuleOptions {
  /** keybind via Nuxt UI defineShortcuts syntax. Default 'g-f' (must not collide). */
  shortcut?: string
  github?: {
    repo: string                 // "owner/name"
    labels?: { feature?: string, feedback?: string }  // default 'enhancement' / 'feedback'
  }
  /** true = auto-detect host Sentry; false = disable bug->Sentry route. Default true. */
  sentry?: boolean
  /** path to a host file default-exporting async (event) => ({ id, email, name } | null). */
  resolveUserPath?: string
  /** disable entirely (e.g. per-env). Default true. */
  enabled?: boolean
}
```
- The GitHub **token is a secret** — read it from `runtimeConfig` (`NUXT_GITHUB_TOKEN`), **never** a
  public option, never in the client bundle.
- Expose only non-secret config to the client via `runtimeConfig.public.feedback`
  (e.g. `shortcut`, `enabled`).

---

## Behavior spec

### Trigger & dialog (client)
- Plugin registers the configured shortcut globally and mounts `<FeedbackDialog>` once (Teleport to
  body). `useFeedback().open(type?)` opens it programmatically.
- Dialog: a 3-way type toggle (Bug / Feature / Feedback), a required message textarea, an optional
  email field (prefilled if host identity is available), submit with loading / success / error
  states + toast; success closes the dialog. Accessible (focus trap via `UModal`, labelled fields,
  Esc to close). Match Nuxt UI v4 styling.

### Submit (client → server)
POST to `/api/__feedback`:
```jsonc
{
  "type": "bug|feature|feedback",
  "message": "...",
  "email": "optional",
  "context": { "url": "...", "userAgent": "...", "app": "<appName>", "ts": "ISO-8601" }
}
```

### Server route `/api/__feedback` (POST)
1. Validate the body (use **zod** — add it as a module dependency; the module is standalone and
   must not assume the host's validator). Reject empty / oversized messages.
2. `const user = await resolveUser(event)` (host hook; may be `null`).
3. Route by `type`:
   - `bug` → `lib/sentry.ts`. If Sentry is unavailable/disabled, **fall back to a GitHub issue
     labelled `bug`** so a report is never silently dropped; log a warning.
   - `feature` / `feedback` → `lib/github.ts`.
4. Never echo the token. On integration failure return a clean `{ ok: false }` (502-ish status) +
   `console.error` server-side; do not leak provider internals to the client.
5. Add a basic message-length guard. Full rate limiting / spam protection is out of scope.

### `lib/github.ts`
`$fetch('https://api.github.com/repos/{repo}/issues', …)` with
`Authorization: Bearer ${token}` and `Accept: application/vnd.github+json`. (Use raw `$fetch` — no
octokit dependency.) Title = type prefix + truncated first line of the message. Body = message +
reporter (name/email/id, or "anonymous") + context (url, app, UA, timestamp) as readable markdown.
Apply the configured label.

### `lib/sentry.ts`
Guarded: `const Sentry = await import('@sentry/node').catch(() => null)`. If present, prefer
`Sentry.captureFeedback({ name, email, message })`; if that API isn't available in the installed
version, fall back to
`Sentry.captureMessage(message, { level: 'warning', tags: { feedbackType: 'bug' }, user })`.
This runs in the same process as the host's initialized server Sentry, so the global client is
reused — **confirm with a day-1 spike; this is the top risk.**

### `resolveUser` wiring
If `resolveUserPath` is set, expose it to the server runtime via a virtual module
(e.g. `addServerTemplate` / a `#feedback/resolve-user` alias that re-exports the host file's
default); otherwise the virtual exports `async () => null`. The server handler imports `resolveUser`
from that virtual. Use the idiomatic Nuxt module mechanism (consult the `nuxt` skill +
`@nuxt/module-builder` docs).

---

## Consumer #1 — wire into Booking-Dashboard (separate repo, via local link)
Work in `/Users/floo/Documents/Coding/_GlobalLawExperts/Booking-Dashboard`:
- Add `@floo-one/nuxt-feedback` as a **local link** (`pnpm link`, or
  `"@floo-one/nuxt-feedback": "file:../../floo-one/nuxt-feedback"` in `apps/web/package.json`).
  **Do not publish.**
- Register it in `apps/web/nuxt.config.ts` `modules`; configure
  `github.repo: 'globallawexperts/GLE-Bookings'`, `sentry: true`, `shortcut: 'g-f'`,
  and `resolveUserPath` → a new file `apps/web/server/feedback-user.ts` that default-exports:
  ```ts
  export default async (event) => {
    const session = await getAuthSession(event)        // existing better-auth util
    return session?.user ? { id: session.user.id, email: session.user.email, name: session.user.name } : null
  }
  ```
  (Return `null` when logged-out; never throw.)
- Add `NUXT_GITHUB_TOKEN` to `.env.example` (comment: server-only, fine-grained PAT scoped to the
  one repo, `issues:write`) and note setting it in the Coolify UI.
- Verify the `g-f` shortcut does not collide with `useDashboardNavigation.ts`.

---

## Build order (walking skeleton — do in this order)
1. **Spike (~1h, timeboxed):** confirm server-side Sentry capture works from a dynamic
   `@sentry/node` import inside Booking-Dashboard. Lock the API (`captureFeedback` vs `captureMessage`).
2. `git init` the new module folder; scaffold module + playground; `pnpm build` (prepack) green.
3. Dialog UI working in the playground.
4. Shortcut + plugin + `useFeedback` (open via the keybind in the playground).
5. Server route + zod validation + `resolveUser` virtual (default `null`) + metadata.
6. GitHub issue creation (feature/feedback) — see a real issue appear.
7. Sentry bug capture — see a real feedback/event appear.
8. Link into Booking-Dashboard; `resolveUser` → better-auth; env; verify e2e in dev.
9. README, including a short **per-app integration guide** (install, module options, the
   `resolveUser` contract, env vars) the other GLE projects will follow.

---

## Acceptance criteria (Definition of Done)
- [ ] `pnpm build` of the module is clean; the playground opens the dialog via the keybind and submits.
- [ ] Bug → a Sentry feedback/event is visible in the `gle-bookings` project.
- [ ] Feature & Feedback → GitHub Issues created in `globallawexperts/GLE-Bookings` with correct labels.
- [ ] Module runs live in Booking-Dashboard **dev**, reporter identity resolved via better-auth.
- [ ] Remove `@sentry/*` from a host → the bug route degrades gracefully (no 500; falls back to GitHub).
- [ ] No GitHub token in the client bundle (grep the build output); token only in private `runtimeConfig`.
- [ ] Lint + typecheck pass for the module package (and for `apps/web` after wiring).
- [ ] README documents install, options, the `resolveUser` contract, env vars, and the integration guide.

---

## Out of scope — DO NOT build this sprint
- GitHub Projects v2 board placement (GraphQL).
- Screenshot capture / Sentry session-replay linkage richness.
- Publishing to GitHub Packages / any registry (local workspace link only).
- Full rate limiting / spam protection beyond a basic length guard.
- Public docs site, multi-language, theming options API.
- Validating the Nuxt-nightly-5 edge case (`Domain-Standardizer`).

---

## Constraints & conventions
- **Zero coupling:** the module must not import from any GLE project or from better-auth. It must
  build in complete isolation.
- Match modern Vue/Nuxt conventions: `<script setup lang="ts">`, Composition API, Nuxt UI v4
  components, the `defineModel('open')` modal pattern. (Use the `vue-best-practices`, `nuxt`,
  `nuxt-ui`, `vue` skills.)
- TypeScript strict. Keep runtime deps minimal: **zod** for validation, raw `$fetch` for GitHub
  (no octokit). **Sentry is a peer dependency**, not a dependency.
- Secrets never reach the client and never appear in responses or logs.
- pnpm only.

## Skills to use
`nuxt`, `nuxt-ui`, `vue-best-practices`, `vue`, `pnpm`. Read the `@nuxt/module-builder` docs for
module structure. When the Sentry User Feedback API shape is unclear, check the installed
`@sentry/node` v10 types directly rather than guessing.

## First reply before coding
Restate your plan in 5–8 bullets, list any place the real codebase contradicts this brief, and
report the day-1 Sentry spike result before building the bug route.
