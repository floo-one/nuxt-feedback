/**
 * Client plugin: mounts a single <FeedbackDialog> into <body> once the app is
 * ready. The vnode reuses the Nuxt app context, so composables that rely on
 * `useState` (e.g. Nuxt UI's `useToast`) resolve against the host app — the
 * dialog's toasts surface through the host's existing <UApp> toaster.
 *
 * The keyboard shortcut itself is registered inside the dialog component, where
 * Nuxt UI's `defineShortcuts` has a proper component scope.
 */
declare const _default: import("nuxt/app").Plugin<Record<string, unknown>> & import("nuxt/app").ObjectPlugin<Record<string, unknown>>;
export default _default;
