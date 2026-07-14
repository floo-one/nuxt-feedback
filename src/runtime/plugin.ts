import { createVNode, render } from 'vue'
import type { Component } from 'vue'
import { defineNuxtPlugin } from '#app'
import FeedbackDialog from './components/FeedbackDialog.vue'
import FeedbackHistory from './components/FeedbackHistory.vue'
import { installConsoleBuffer } from './utils/consoleBuffer'
import type { PublicFeedbackConfig } from './types'

/**
 * Client plugin: mounts a single <FeedbackDialog> into <body> once the app is
 * ready. The vnode reuses the Nuxt app context, so composables that rely on
 * `useState` (e.g. Nuxt UI's `useToast`) resolve against the host app — the
 * dialog's toasts surface through the host's existing <UApp> toaster.
 *
 * The keyboard shortcut itself is registered inside the dialog component, where
 * Nuxt UI's `defineShortcuts` has a proper component scope.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const config = nuxtApp.$config.public.feedback as PublicFeedbackConfig | undefined
  if (config?.enabled === false) {
    return
  }

  // Start capturing console errors immediately so the buffer has history by the
  // time a user opens the dialog to report a bug.
  installConsoleBuffer()

  // Mount a component into a fresh <body> div, reusing the Nuxt app context so
  // its composables (useState-backed toasts, shared open state) resolve against
  // the host app. Idempotent per root id.
  function mount(id: string, component: Component) {
    if (document.getElementById(id)) {
      return
    }
    const el = document.createElement('div')
    el.id = id
    document.body.appendChild(el)

    const vnode = createVNode(component)
    vnode.appContext = nuxtApp.vueApp._context
    render(vnode, el)
  }

  nuxtApp.hook('app:mounted', () => {
    mount('floo-feedback-root', FeedbackDialog)
    mount('floo-feedback-history-root', FeedbackHistory)
  })
})
