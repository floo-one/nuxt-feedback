export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@floo-one/nuxt-feedback'],
  devtools: { enabled: true },
  css: ['~~/assets/css/main.css'],

  // The GitHub token is read from NUXT_GITHUB_TOKEN at runtime; keep it empty here.
  runtimeConfig: {
    githubToken: '',
  },
  compatibilityDate: 'latest',

  // Mirrors a real GLE host: a test repo + a (fake) server-side identity hook.
  feedback: {
    shortcut: 'g-f',
    sentry: true,
    github: {
      repo: 'floo-one/nuxt-feedback',
    },
    resolveUserPath: './server/feedback-user.ts',
  },
})
