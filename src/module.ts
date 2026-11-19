import {
  defineNuxtModule,
  createResolver,
  addComponent,
  addImports,
  addPlugin,
  addServerHandler,
  addTypeTemplate,
} from '@nuxt/kit'
import { sourceAttributeTransform } from './sourceAttribute'
import type { PublicFeedbackConfig } from './runtime/types'

export interface ModuleOptions {
  /**
   * Keyboard shortcut that starts the element picker; the panel opens on the
   * pick (Escape opens it without one). Nuxt UI `defineShortcuts` syntax.
   * Default `'g-f'` (chosen to avoid colliding with common dashboard chords).
   */
  shortcut?: string
  /**
   * Only identified users (the `resolveUserPath` hook returns a user) get the
   * shortcut and dialog, and the server rejects anonymous reports with 401.
   * Default `false`.
   */
  requireUser?: boolean
  /**
   * Capture a screenshot of each picked element (or the viewport when nothing
   * was picked) and show it in the issue. Images are committed to
   * `github.assetsRepo`; a failed upload files the issue without them.
   * Default `true`.
   */
  screenshots?: boolean
  /**
   * Stamp the root element of each of your own components with
   * `data-fb-src="<file>"` at build time, so reports from production builds name
   * the component file. The paths are visible in the page HTML. Default `false`.
   */
  sourceAttribute?: boolean
  github?: {
    /** Target repository for issues, as `"owner/name"`. Required for feature requests. */
    repo: string
    /**
     * Repository screenshots are committed to, as `"owner/name"`. Default
     * `"<owner of repo>/feedback-assets"`. Keep it private; the token needs
     * Contents: read and write on it.
     */
    assetsRepo?: string
    /**
     * Issue labels. Two schemes:
     *  - Legacy (default): one label per issue — `feature` (default `enhancement`)
     *    or `bug`.
     *  - Prefixed: set ANY of `base`/`typePrefix`/`appPrefix`/`severityPrefix`/
     *    `categoryPrefix` to switch on multi-label output — `<base>`,
     *    `<typePrefix>bug|idea`, `<appPrefix><bucket>` (when an app bucket
     *    resolves), `<severityPrefix><level>` and `<categoryPrefix><kind>` (both
     *    bugs only). Unset prefixes fall back to
     *    `feedback` / `type:` / `app:` / `severity:` / `category:`.
     */
    labels?: {
      feature?: string
      base?: string
      typePrefix?: string
      appPrefix?: string
      severityPrefix?: string
      categoryPrefix?: string
    }
  }
  /**
   * Host build identifier (e.g. a git SHA) attached to every report as
   * `context.version`. Exposed to the client via public runtime config.
   */
  version?: string
  /**
   * Path (relative to the Nuxt project root) to a host file that default-exports
   * `async (event) => ({ id, email, name } | null)`. Used to attach reporter identity
   * server-side. When unset, identity resolves to `null` (anonymous).
   */
  resolveUserPath?: string
  /**
   * Path (relative to the Nuxt project root) to a host file that default-exports
   * `async (event, context) => string | null`, mapping a submission (via
   * `context.url`) to an "app bucket" used for the `app:` label and the **App:**
   * issue line. When unset (or it returns null) the module falls back to
   * `context.app`. Keeps route→bucket logic in the host, not the module.
   */
  resolveAppPath?: string
  /**
   * Path (relative to the Nuxt project root) to a host file that default-exports
   * `async (report, result) => void`, called server-side **after** a report is
   * successfully filed as a GitHub issue. The hook is where the host wires
   * notifications (Slack), logging, or its own "my reports" tracking. It must
   * never need to succeed for the submission to succeed — a throw is caught and
   * ignored. Not called when issue creation fails.
   */
  onSubmitPath?: string
  /** Disable the module entirely (e.g. per-environment). Default `true`. */
  enabled?: boolean
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@floo-one/nuxt-feedback',
    configKey: 'feedback',
    compatibility: {
      nuxt: '>=4.0.0',
    },
  },
  defaults: {
    shortcut: 'g-f',
    enabled: true,
    github: {
      repo: '',
      labels: {
        feature: 'enhancement',
      },
    },
  },
  setup(options, nuxt) {
    if (options.enabled === false) {
      return
    }

    const resolver = createResolver(import.meta.url)

    // ---- Runtime config -----------------------------------------------------
    // Secret: the GitHub token. Top-level key so Nuxt maps it to `NUXT_GITHUB_TOKEN`.
    // Never expose this to the client.
    nuxt.options.runtimeConfig.githubToken ??= ''

    // Server-only, non-secret config consumed by the API route.
    // Resolve the label scheme. The prefixed (multi-label) scheme activates only
    // when the host sets at least one prefix key — otherwise legacy single-label
    // behaviour is preserved untouched.
    const l = options.github?.labels ?? {}
    const prefixed
      = l.base !== undefined
        || l.typePrefix !== undefined
        || l.appPrefix !== undefined
        || l.severityPrefix !== undefined
        || l.categoryPrefix !== undefined

    const runtimeConfig = nuxt.options.runtimeConfig as Record<string, unknown>
    const repo = options.github?.repo ?? ''
    const screenshots = options.screenshots ?? true
    const assetsRepo = options.github?.assetsRepo || (repo.includes('/') ? `${repo.split('/')[0]}/feedback-assets` : '')
    runtimeConfig.feedback = {
      requireUser: options.requireUser ?? false,
      // Coolify passes SOURCE_COMMIT as a build arg; the server prefers the runtime env.
      buildCommit: process.env.SOURCE_COMMIT || undefined,
      github: {
        repo,
        assetsRepo: screenshots ? assetsRepo : '',
        labels: {
          bug: 'bug',
          feature: l.feature || 'enhancement',
          prefixed,
          base: l.base ?? 'feedback',
          typePrefix: l.typePrefix ?? 'type:',
          appPrefix: l.appPrefix ?? 'app:',
          severityPrefix: l.severityPrefix ?? 'severity:',
          categoryPrefix: l.categoryPrefix ?? 'category:',
        },
      },
    }

    // Public, client-exposed config. No secrets. Assigned through a widened cast
    // (same escape hatch as the private config above) so Nuxt doesn't narrow the
    // generated runtime-config type to a host fixture's concrete values.
    const appTitle = nuxt.options.app?.head?.title
    const publicConfig: PublicFeedbackConfig = {
      shortcut: options.shortcut || 'g-f',
      // Dev only: component files are only known in dev, and a prod bundle shouldn't carry a local path.
      sourceRoot: nuxt.options.dev ? nuxt.options.workspaceDir : undefined,
      requireUser: options.requireUser ?? false,
      screenshots: screenshots && !!assetsRepo,
      enabled: options.enabled ?? true,
      app: typeof appTitle === 'string' && appTitle ? appTitle : undefined,
      version: options.version || undefined,
    }
    ;(nuxt.options.runtimeConfig.public as Record<string, unknown>).feedback = publicConfig

    // ---- Source attribute -----------------------------------------------------
    // Production only: dev builds name components from Vue's own bookkeeping, and
    // Vue warns in dev when a fragment-rooted component can't place the attribute.
    if (options.sourceAttribute && !nuxt.options.dev) {
      nuxt.options.vue.compilerOptions ??= {}
      const transforms = (nuxt.options.vue.compilerOptions.nodeTransforms ??= [])
      transforms.push(sourceAttributeTransform(nuxt.options.workspaceDir) as unknown as (typeof transforms)[number])
    }

    // ---- Component ----------------------------------------------------------
    // Registered globally so hosts can also place <FeedbackDialog /> manually.
    addComponent({
      name: 'FeedbackDialog',
      filePath: resolver.resolve('./runtime/components/FeedbackDialog.vue'),
    })
    // The "your reports" history drawer (loop-back to the reporter).
    addComponent({
      name: 'FeedbackHistory',
      filePath: resolver.resolve('./runtime/components/FeedbackHistory.vue'),
    })

    // ---- Composable ---------------------------------------------------------
    addImports({
      name: 'useFeedback',
      from: resolver.resolve('./runtime/composables/useFeedback'),
    })

    // ---- Client plugin (registers shortcut + auto-mounts the dialog) --------
    addPlugin({
      src: resolver.resolve('./runtime/plugin'),
      mode: 'client',
    })

    // ---- Server API routes --------------------------------------------------
    addServerHandler({
      route: '/api/__feedback',
      method: 'post',
      handler: resolver.resolve('./runtime/server/api/feedback.post'),
    })
    // Lets the client know if the user is already identified (to skip the email field).
    addServerHandler({
      route: '/api/__feedback/identity',
      method: 'get',
      handler: resolver.resolve('./runtime/server/api/identity.get'),
    })
    // Refreshes open/closed state for the reports the client filed (history drawer).
    addServerHandler({
      route: '/api/__feedback/status',
      method: 'get',
      handler: resolver.resolve('./runtime/server/api/status.get'),
    })
    // Issue comment thread: GET reads it, POST replies. Both live in one handler
    // (registering GET+POST on the same route via two calls makes Nitro drop it).
    // Gated on an identified user inside the handler.
    addServerHandler({
      route: '/api/__feedback/thread',
      handler: resolver.resolve('./runtime/server/api/thread'),
    })

    // ---- resolveUser virtual module -----------------------------------------
    // The server route imports identity resolution from `#feedback/resolve-user`.
    // If the host supplied a path, re-export its default; otherwise default to anonymous.
    const resolveUserCode = options.resolveUserPath
      ? `export { default } from ${JSON.stringify(
        createResolver(nuxt.options.rootDir).resolve(options.resolveUserPath),
      )}`
      : 'export default async () => null'

    // ---- resolveApp virtual module ------------------------------------------
    // Same pattern as resolveUser: the host maps a submission to an app bucket.
    const resolveAppCode = options.resolveAppPath
      ? `export { default } from ${JSON.stringify(
        createResolver(nuxt.options.rootDir).resolve(options.resolveAppPath),
      )}`
      : 'export default async () => null'

    // ---- onSubmit virtual module --------------------------------------------
    // Same pattern again: the host runs its own code after a report is filed.
    // Default is a no-op so the server route can always import + call it.
    const onSubmitCode = options.onSubmitPath
      ? `export { default } from ${JSON.stringify(
        createResolver(nuxt.options.rootDir).resolve(options.onSubmitPath),
      )}`
      : 'export default async () => {}'

    nuxt.hook('nitro:config', (nitroConfig) => {
      nitroConfig.virtual ||= {}
      nitroConfig.virtual['#feedback/resolve-user'] = resolveUserCode
      nitroConfig.virtual['#feedback/resolve-app'] = resolveAppCode
      nitroConfig.virtual['#feedback/on-submit'] = onSubmitCode
    })

    // Type declarations for the virtual modules (app + nitro contexts).
    addTypeTemplate({
      filename: 'types/floo-feedback-resolve-user.d.ts',
      getContents: () =>
        [
          `declare module '#feedback/resolve-user' {`,
          `  import type { H3Event } from 'h3'`,
          `  const resolveUser: (event: H3Event) => Promise<{ id?: string, email?: string, name?: string } | null>`,
          `  export default resolveUser`,
          `}`,
          ``,
        ].join('\n'),
    })
    addTypeTemplate({
      filename: 'types/floo-feedback-resolve-app.d.ts',
      getContents: () =>
        [
          `declare module '#feedback/resolve-app' {`,
          `  import type { H3Event } from 'h3'`,
          `  const resolveApp: (event: H3Event, context?: { url?: string, app?: string, [key: string]: unknown }) => Promise<string | null>`,
          `  export default resolveApp`,
          `}`,
          ``,
        ].join('\n'),
    })
    addTypeTemplate({
      filename: 'types/floo-feedback-on-submit.d.ts',
      getContents: () =>
        [
          `declare module '#feedback/on-submit' {`,
          `  type FeedbackType = 'bug' | 'feature'`,
          `  type FeedbackSeverity = 'critical' | 'blocking' | 'annoying' | 'cosmetic'`,
          `  type FeedbackCategory = 'crash' | 'visual' | 'data' | 'performance'`,
          `  interface FeedbackReport {`,
          `    type: FeedbackType`,
          `    message: string`,
          `    severity?: FeedbackSeverity`,
          `    category?: FeedbackCategory`,
          `    user: { id?: string, email?: string, name?: string } | null`,
          `    email?: string`,
          `    app: string | null`,
          `    labels: string[]`,
          `    context?: { url?: string, userAgent?: string, app?: string, version?: string, severity?: FeedbackSeverity, category?: FeedbackCategory, elements?: Array<{ selector: string, tag: string, text?: string, alt?: string, href?: string, src?: string, section?: { id?: string, heading?: string }, card?: { title?: string, src?: string }, components?: string[], contains?: string[], screenshot?: string }>, screenshot?: string, consoleErrors?: string[], ts?: string }`,
          `  }`,
          `  interface FeedbackResult { channel: 'github', issue: { number: number, url: string } }`,
          `  const onSubmit: (report: FeedbackReport, result: FeedbackResult) => Promise<void>`,
          `  export default onSubmit`,
          `}`,
          ``,
        ].join('\n'),
    })
  },
})
