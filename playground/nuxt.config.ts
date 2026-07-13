export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@floo-one/nuxt-feedback'],
  devtools: { enabled: true },
  css: ['~~/assets/css/main.css'],

  // The GitHub token is read from NUXT_GITHUB_TOKEN at runtime; keep it empty here.
  runtimeConfig: {
    githubToken: '',
  },
  compatibilityDate: 'latest',

  // Mirrors a real GLE host: a test repo, server-side identity + app hooks, a
  // build version, and the prefixed label scheme (activated by `labels.base`).
  feedback: {
    shortcut: 'g-f',
    sentry: true,
    version: 'playground-dev',
    github: {
      repo: 'floo-one/nuxt-feedback',
      labels: { base: 'feedback' },
    },
    resolveUserPath: './server/feedback-user.ts',
    resolveAppPath: './server/feedback-app.ts',
  },
})
