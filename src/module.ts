import {
  defineNuxtModule,
  createResolver,
  addComponent,
  addImports,
  addPlugin,
  addServerHandler,
  addTypeTemplate,
} from '@nuxt/kit'

export interface ModuleOptions {
  /**
   * Keyboard shortcut to open the dialog, in Nuxt UI `defineShortcuts` syntax.
   * Default `'g-f'` (chosen to avoid colliding with common dashboard chords).
   */
  shortcut?: string
  github?: {
    /** Target repository for issues, as `"owner/name"`. Required for feature/feedback. */
    repo: string
    /** Issue labels. Defaults: feature → `enhancement`, feedback → `feedback`. */
    labels?: {
      feature?: string
      feedback?: string
    }
  }
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
        feedback: 'feedback',
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
    const runtimeConfig = nuxt.options.runtimeConfig as Record<string, unknown>
    runtimeConfig.feedback = {
      sentry: options.sentry !== false,
      github: {
        repo: options.github?.repo ?? '',
        labels: {
          bug: 'bug',
          feature: options.github?.labels?.feature || 'enhancement',
          feedback: options.github?.labels?.feedback || 'feedback',
        },
      },
    }

    // Public, client-exposed config. No secrets.
    const appTitle = nuxt.options.app?.head?.title
    nuxt.options.runtimeConfig.public.feedback = {
      shortcut: options.shortcut || 'g-f',
      enabled: options.enabled ?? true,
      app: typeof appTitle === 'string' && appTitle ? appTitle : undefined,
    }

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

    // ---- Server API route ---------------------------------------------------
    addServerHandler({
      route: '/api/__feedback',
      method: 'post',
      handler: resolver.resolve('./runtime/server/api/feedback.post'),
    })

    // ---- resolveUser virtual module -----------------------------------------
    // The server route imports identity resolution from `#feedback/resolve-user`.
    // If the host supplied a path, re-export its default; otherwise default to anonymous.
    const resolveUserCode = options.resolveUserPath
      ? `export { default } from ${JSON.stringify(
        createResolver(nuxt.options.rootDir).resolve(options.resolveUserPath),
      )}`
      : 'export default async () => null'

    nuxt.hook('nitro:config', (nitroConfig) => {
      nitroConfig.virtual ||= {}
      nitroConfig.virtual['#feedback/resolve-user'] = resolveUserCode
    })

    // Type declaration for the virtual module (app + nitro contexts).
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
  },
})
