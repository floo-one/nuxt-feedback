# Learnings — building & shipping @floo-one/nuxt-feedback

Notes from building the module and integrating it into a real Nuxt 4 host
(GLE Booking-Dashboard). Captured so the next integration / the other GLE apps
don't re-discover these.

## Sentry server-side capture (the top risk — resolved)

- The host runs `@sentry/nuxt` with `autoInjectServerSentry: 'top-level-import'`,
  which initialises `@sentry/node` in the **same Nitro process**. A guarded
  `await import('@sentry/node')` from our server lib reuses that already-initialised
  global client — no second `init`, no DSN needed in the module.
- `@sentry/node` v10 exposes `captureFeedback({ message, name, email, url, tags })`
  (the User Feedback API). We prefer it and fall back to `captureMessage` on older
  SDKs. Always guard with `isInitialized()` before capturing, and `await flush()`
  after so short-lived processes still deliver.
- `await import('@sentry/node').catch(() => null)` genuinely returns `null` when the
  SDK is absent — verified by running it both inside and outside a host that has it.
  That's what makes the "Sentry optional" degrade real, not theoretical.
- Keep `@sentry/node` as an **optional peerDependency** + a devDependency (for
  build-time types). module-builder externalises peers, so the dynamic import stays
  in the output and resolves in the host.

## Auto-mounting a dialog outside `<UApp>` (Nuxt UI v4)

- Nuxt UI v4 `useToast()` is backed by Nuxt's global `useState("toasts")`, **not** a
  component-level `inject` (only the optional `max` uses inject). So a dialog mounted
  *outside* the host's `<UApp>` subtree still has its toasts rendered by the host's
  toaster — as long as it shares the **Nuxt app context**.
- The client plugin mounts the dialog once with
  `const vnode = createVNode(FeedbackDialog); vnode.appContext = nuxtApp.vueApp._context; render(vnode, el)`
  into a `<body>` div on `app:mounted`. `UModal` teleports to body, `defineShortcuts`
  has a real component scope, and `useToast`/`useState` resolve against the host app.
- Verified in a browser: dialog opens via `g f` and buttons, submits, and the
  success/error toast surfaces through the host's existing `<UApp>`.

## Importing a peer's composables from module runtime

- Importing `defineShortcuts` / `useToast` from `#imports` fails the module's **own**
  isolated typecheck (its `#imports` doesn't include the `@nuxt/ui` peer's auto-imports).
- Fix: import them from the peer's public API — `@nuxt/ui/composables` (it exposes
  `./composables/*` with types). Same singleton at runtime as the host auto-import,
  but typecheckable standalone. Keep core Nuxt composables (`useRuntimeConfig`) on
  `#imports`.

## The `resolveUser` virtual module

- Register it on the Nitro side via `nuxt.hook('nitro:config', n => n.virtual['#feedback/resolve-user'] = code)`,
  plus an `addTypeTemplate` `declare module` so both app and Nitro typecheck.
- When the host sets `resolveUserPath`, the virtual is just
  `export { default } from '<abs path to host file>'`. Nitro's unimport transform still
  applies to that re-exported host file, so the host's own server auto-imports
  (e.g. Better Auth's `getAuthSession`) resolve there with **no explicit import** —
  confirmed by a clean `nuxt typecheck` of the host after wiring.

## Secrets

- GitHub token lives only in **private** `runtimeConfig.githubToken` (maps to
  `NUXT_GITHUB_TOKEN`). Verified by grepping the built client bundle (`.output/public`):
  the token never appears there — and it isn't even baked into the server bundle; it's
  read from the env at runtime. Non-secret config (`shortcut`, `enabled`, `app`) goes
  in `runtimeConfig.public.feedback`.

## pnpm + distribution

- pnpm 11 manages build-script approval via an `allowBuilds:` map in
  `pnpm-workspace.yaml` (approve `esbuild`, `@parcel/watcher`, `unrs-resolver`,
  `vue-demi`), not the old `.npmrc` `legacy-peer-deps`.
- **Published to npm** as `@floo-one/nuxt-feedback` (public, user scope owned by
  `floo-one`). Using pnpm everywhere is a reason *for* npm, not against — pnpm installs
  from the registry natively, so hosts use a clean semver dep (`^0.1.0`) and `dist/` is
  built on publish via `prepack` (no longer committed to git). The earlier
  `github:floo-one/nuxt-feedback` git-URL approach was only a stopgap before auth.
- **`publishConfig.access: public`** is required (scoped packages default to private).
- **2FA gotcha:** the account has 2FA, so every `npm publish` needs a fresh OTP —
  *being logged in is not enough*. Run `npm publish --otp=<code>`, complete the browser
  flow, or use a **Granular Access Token** (Packages read+write) to bypass OTP in CI.
- Publish flow that works from clean: `pnpm dev:prepare` (so `prepack`'s build finds
  `.nuxt/tsconfig.json`) → `npm publish --access public`. Bump the version for each
  release; npm won't overwrite an existing version (so README/doc-only changes reach the
  npm page only on the next version bump).

## Host realities that differed from assumptions

- `@nuxt/ui` in Booking-Dashboard is **4.9.0** (not 4.6.1), still API-compatible; it
  lives in `packages/layer-core`, so a `file:`/git dep in `apps/web` satisfies the
  peer transitively.
- The host's Sentry config sets **no EU region/url** — only `org: globallawexperts`,
  `project: gle-bookings`. Region is encoded in the DSN, not the config.
- `zod` is v4 in the host, so the module uses Zod 4 idioms (`z.email()`).
- Shortcut `g-f` is free; taken chords are `g-a g-b g-i g-o g-s` and `n`
  (`useDashboardNavigation.ts`).
- `apps/web/nuxt.config.ts` already had two pre-existing eslint findings in its Sentry
  block (`no-console`, key-order) — left untouched; our additions lint clean. Their
  `@antfu` config enforces `perfectionist/sort-objects` (alphabetical keys) and
  space-before-paren on named functions.
- The local `.env` here lacks `NUXT_BETTER_AUTH_SECRET` (the repo's one hard env
  requirement), so `pnpm install`'s postinstall `nuxi prepare` fails on env validation.
  Use `SKIP_ENV_VALIDATION=true` for install/prepare/typecheck when secrets are absent.

## Verified vs. still credential-gated

- ✅ Live: GitHub issue creation end-to-end (title prefix, label, markdown body with
  server-resolved reporter + context). Graceful Sentry-absent fallback → GitHub. No
  token in client bundle. Host typecheck/lint after wiring.
- ⏳ Not live-tested (needs real secrets in the host runtime): bug → a visible Sentry
  User Feedback event in `gle-bookings`, and the full Better-Auth identity path in a
  running Booking-Dashboard dev server (needs DB + `NUXT_BETTER_AUTH_SECRET`).
