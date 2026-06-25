<script setup lang="ts">
const { open } = useFeedback()
</script>

<template>
  <UApp>
    <UContainer class="py-16 space-y-6">
      <div class="space-y-2">
        <h1 class="text-2xl font-bold">
          @floo-one/nuxt-feedback playground
        </h1>
        <p class="text-(--ui-text-muted)">
          Press <UKbd value="g" /> then <UKbd value="f" /> to open the dialog, or use a button below.
        </p>
      </div>

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
          icon="i-lucide-lightbulb"
          color="primary"
          variant="soft"
          @click="open('feature')"
        >
          Request a feature
        </UButton>
        <UButton
          icon="i-lucide-message-circle"
          color="neutral"
          variant="soft"
          @click="open('feedback')"
        >
          Share feedback
        </UButton>
      </div>
    </UContainer>
  </UApp>
</template>
