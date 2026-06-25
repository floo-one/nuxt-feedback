import { createVNode, render } from 'vue'
import { defineNuxtPlugin } from '#app'
import FeedbackDialog from './components/FeedbackDialog.vue'
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

  nuxtApp.hook('app:mounted', () => {
    if (document.getElementById('floo-feedback-root')) {
      return
    }
    const el = document.createElement('div')
    el.id = 'floo-feedback-root'
    document.body.appendChild(el)

    const vnode = createVNode(FeedbackDialog)
    vnode.appContext = nuxtApp.vueApp._context
    render(vnode, el)
  })
})
