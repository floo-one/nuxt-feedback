import {
  defineNuxtModule,
  createResolver,
  addComponent,
  addImports,
  addPlugin,
  addServerHandler,
  addTypeTemplate,
} from '@nuxt/kit'
import type { PublicFeedbackConfig } from './runtime/types'

export interface ModuleOptions {
  /**
   * Keyboard shortcut to open the dialog, in Nuxt UI `defineShortcuts` syntax.
   * Default `'g-f'` (chosen to avoid colliding with common dashboard chords).
   */
  shortcut?: string
  github?: {
    /** Target repository for issues, as `"owner/name"`. Required for feature requests. */
    repo: string
    /**
     * Issue labels. Two schemes:
     *  - Legacy (default): one label per issue — `feature` (default `enhancement`)
     *    or `bug`.
     *  - Prefixed: set ANY of `base`/`typePrefix`/`appPrefix`/`severityPrefix` to
     *    switch on multi-label output — `<base>`, `<typePrefix>bug|idea`,
     *    `<appPrefix><bucket>` (when an app bucket resolves), and
     *    `<severityPrefix><level>` (bugs only). Unset prefixes fall back to
     *    `feedback` / `type:` / `app:` / `severity:`.
     */
    labels?: {
      feature?: string
      base?: string
      typePrefix?: string
      appPrefix?: string
      severityPrefix?: string
    }
  }
  /**
   * Host build identifier (e.g. a git SHA) attached to every report as
   * `context.version`. Exposed to the client via public runtime config.
   */
  version?: string
  /**
   * `true` (default) auto-detects the host's server Sentry SDK for the bug route.
   * `false` disables the bug→Sentry route (bugs then fall back to a GitHub issue).
   */
  sentry?: boolean
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
    sentry: true,
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

    const runtimeConfig = nuxt.options.runtimeConfig as Record<string, unknown>
    runtimeConfig.feedback = {
      sentry: options.sentry !== false,
      github: {
        repo: options.github?.repo ?? '',
        labels: {
          bug: 'bug',
          feature: l.feature || 'enhancement',
          prefixed,
          base: l.base ?? 'feedback',
          typePrefix: l.typePrefix ?? 'type:',
          appPrefix: l.appPrefix ?? 'app:',
          severityPrefix: l.severityPrefix ?? 'severity:',
        },
      },
    }

    // Public, client-exposed config. No secrets. Assigned through a widened cast
    // (same escape hatch as the private config above) so Nuxt doesn't narrow the
    // generated runtime-config type to a host fixture's concrete values.
    const appTitle = nuxt.options.app?.head?.title
    const publicConfig: PublicFeedbackConfig = {
      shortcut: options.shortcut || 'g-f',
      enabled: options.enabled ?? true,
      app: typeof appTitle === 'string' && appTitle ? appTitle : undefined,
      version: options.version || undefined,
    }
    ;(nuxt.options.runtimeConfig.public as Record<string, unknown>).feedback = publicConfig

    // ---- Component ----------------------------------------------------------
    // Registered globally so hosts can also place <FeedbackDialog /> manually.
    addComponent({
      name: 'FeedbackDialog',
      filePath: resolver.resolve('./runtime/components/FeedbackDialog.vue'),
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

    nuxt.hook('nitro:config', (nitroConfig) => {
      nitroConfig.virtual ||= {}
      nitroConfig.virtual['#feedback/resolve-user'] = resolveUserCode
      nitroConfig.virtual['#feedback/resolve-app'] = resolveAppCode
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
  },
})
