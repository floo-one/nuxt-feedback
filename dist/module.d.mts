import * as _nuxt_schema from '@nuxt/schema';

interface ModuleOptions {
    /**
     * Keyboard shortcut to open the dialog, in Nuxt UI `defineShortcuts` syntax.
     * Default `'g-f'` (chosen to avoid colliding with common dashboard chords).
     */
    shortcut?: string;
    github?: {
        /** Target repository for issues, as `"owner/name"`. Required for feature/feedback. */
        repo: string;
        /** Issue labels. Defaults: feature → `enhancement`, feedback → `feedback`. */
        labels?: {
            feature?: string;
            feedback?: string;
        };
    };
    /**
     * `true` (default) auto-detects the host's server Sentry SDK for the bug route.
     * `false` disables the bug→Sentry route (bugs then fall back to a GitHub issue).
     */
    sentry?: boolean;
    /**
     * Path (relative to the Nuxt project root) to a host file that default-exports
     * `async (event) => ({ id, email, name } | null)`. Used to attach reporter identity
     * server-side. When unset, identity resolves to `null` (anonymous).
     */
    resolveUserPath?: string;
    /** Disable the module entirely (e.g. per-environment). Default `true`. */
    enabled?: boolean;
}
declare const _default: _nuxt_schema.NuxtModule<ModuleOptions, ModuleOptions, false>;

export { _default as default };
export type { ModuleOptions };
