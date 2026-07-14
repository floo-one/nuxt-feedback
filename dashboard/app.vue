<script setup lang="ts">
const { open } = useFeedback()

useHead({ title: '@floo-one/nuxt-feedback — live demo' })
</script>

<template>
  <UApp>
    <UContainer class="max-w-2xl py-16 space-y-10">
      <div class="space-y-3">
        <div class="flex items-center gap-3">
          <h1 class="text-3xl font-bold">
            nuxt-feedback
          </h1>
          <UBadge
            variant="soft"
            color="neutral"
            label="live demo"
          />
        </div>
        <p class="text-(--ui-text-muted)">
          A drop-in in-app feedback dialog for Nuxt 4. This site is the module's
          live demo today — the dialog you open here is the real thing, wired to
          a real GitHub repo — and it will grow into the dashboard for triaging
          the issues that come in.
        </p>
      </div>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Try it
          </h2>
        </template>
        <div class="space-y-4">
          <p>
            Press <UKbd value="g" /> then <UKbd value="f" /> anywhere on this
            page, or use a button:
          </p>
          <div class="flex flex-wrap gap-3">
            <UButton
              icon="i-lucide-bug"
              color="error"
              variant="soft"
              @click="open('bug')"
            >
              Report a bug
            </UButton>
            <UButton
              icon="i-lucide-message-circle"
              color="primary"
              variant="soft"
              @click="open('feature')"
            >
              Share feedback
            </UButton>
          </div>
          <p class="text-sm text-(--ui-text-muted)">
            Submissions become real issues in
            <ULink
              to="https://github.com/floo-one/nuxt-feedback/issues"
              target="_blank"
            >floo-one/nuxt-feedback</ULink> — check the issues list after you
            hit send. The demo's identity hook signs you in as
            <span class="font-mono">Dashboard User</span>, so the dialog skips
            the email field, exactly like in a logged-in app.
          </p>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            What happens on send
          </h2>
        </template>
        <ul class="space-y-2 text-sm">
          <li class="flex gap-2">
            <UIcon
              name="i-lucide-bug"
              class="mt-0.5 shrink-0 text-(--ui-error)"
            />
            <span>
              <strong>Bug</strong> → a GitHub issue labelled
              <span class="font-mono">bug</span>, carrying the type
              (crash / visual / data / performance) and severity you pick.
            </span>
          </li>
          <li class="flex gap-2">
            <UIcon
              name="i-lucide-message-circle"
              class="mt-0.5 shrink-0 text-(--ui-primary)"
            />
            <span>
              <strong>Feedback</strong> → a GitHub issue labelled
              <span class="font-mono">enhancement</span>.
            </span>
          </li>
          <li class="flex gap-2">
            <UIcon
              name="i-lucide-github"
              class="mt-0.5 shrink-0 text-(--ui-text-muted)"
            />
            <span>
              Everything lands on GitHub — one place to triage. Each issue
              includes the page URL, app context, and who sent it.
            </span>
          </li>
        </ul>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Use it in your app
          </h2>
        </template>
        <div class="space-y-3">
          <pre class="rounded-md bg-(--ui-bg-elevated) p-4 text-sm overflow-x-auto"><code>pnpm add @floo-one/nuxt-feedback</code></pre>
          <p class="text-sm text-(--ui-text-muted)">
            Add it to <span class="font-mono">modules</span>, point
            <span class="font-mono">github.repo</span> at your repo, set
            <span class="font-mono">NUXT_GITHUB_TOKEN</span> — done. Setup,
            options and the auth hook are in the
            <ULink
              to="https://github.com/floo-one/nuxt-feedback#readme"
              target="_blank"
            >README</ULink>.
          </p>
        </div>
      </UCard>
    </UContainer>
  </UApp>
</template>
