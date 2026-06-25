<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { z } from 'zod'
import { useRuntimeConfig } from '#imports'
// `@nuxt/ui` is a peer dependency; import its composables from its public API so
// the module typechecks in isolation. At runtime this resolves to the same
// singleton the host auto-imports, so toasts surface through the host's <UApp>.
import { defineShortcuts, useToast } from '@nuxt/ui/composables'
import { useFeedback } from '../composables/useFeedback'
import type { FeedbackType, PublicFeedbackConfig } from '../types'

const { isOpen, type, submit, close } = useFeedback()
const toast = useToast()
const config = useRuntimeConfig().public.feedback as PublicFeedbackConfig

const typeItems = [
  { label: 'Bug', value: 'bug', icon: 'i-lucide-bug' },
  { label: 'Feature', value: 'feature', icon: 'i-lucide-lightbulb' },
  { label: 'Feedback', value: 'feedback', icon: 'i-lucide-message-circle' },
] satisfies Array<{ label: string, value: FeedbackType, icon: string }>

const schema = z.object({
  type: z.enum(['bug', 'feature', 'feedback']),
  message: z
    .string()
    .trim()
    .min(1, 'Please enter a message')
    .max(5000, 'Message is too long (5000 characters max)'),
  email: z.union([z.literal(''), z.email('Enter a valid email address')]).optional(),
})

const state = reactive<{ type: FeedbackType, message: string, email: string }>({
  type: type.value,
  message: '',
  email: '',
})

// Keep the toggle in sync when the dialog is opened programmatically with a type.
watch(type, (value) => {
  state.type = value
})

const loading = ref(false)

// Register the global shortcut to open the dialog.
if (config?.shortcut) {
  defineShortcuts({
    [config.shortcut]: () => {
      isOpen.value = true
    },
  })
}

const titles: Record<FeedbackType, string> = {
  bug: 'Report a bug',
  feature: 'Request a feature',
  feedback: 'Share feedback',
}
const descriptions: Record<FeedbackType, string> = {
  bug: 'Something broken or behaving unexpectedly? Let us know what happened.',
  feature: 'Have an idea that would make this better? Tell us about it.',
  feedback: 'Anything else on your mind? We read every note.',
}
const title = computed(() => titles[state.type])
const description = computed(() => descriptions[state.type])

async function onSubmit() {
  loading.value = true
  try {
    await submit({
      type: state.type,
      message: state.message,
      email: state.email || undefined,
      context: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        app: config?.app,
        ts: new Date().toISOString(),
      },
    })
    toast.add({
      title: 'Thanks for your feedback!',
      description: 'Your report has been sent.',
      color: 'success',
      icon: 'i-lucide-circle-check',
    })
    state.message = ''
    state.email = ''
    close()
  }
  catch {
    toast.add({
      title: 'Could not send feedback',
      description: 'Something went wrong on our side. Please try again in a moment.',
      color: 'error',
      icon: 'i-lucide-circle-alert',
    })
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :title="title"
    :description="description"
  >
    <template #body>
      <UForm
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField
          name="type"
          label="Type"
        >
          <URadioGroup
            v-model="state.type"
            :items="typeItems"
            orientation="horizontal"
          />
        </UFormField>

        <UFormField
          name="message"
          label="Message"
          required
        >
          <UTextarea
            v-model="state.message"
            :rows="5"
            autoresize
            autofocus
            class="w-full"
            placeholder="Describe what happened, or what you'd like to see…"
          />
        </UFormField>

        <UFormField
          name="email"
          label="Email"
          hint="Optional"
        >
          <UInput
            v-model="state.email"
            type="email"
            class="w-full"
            placeholder="you@example.com"
          />
        </UFormField>

        <div class="flex justify-end gap-2 pt-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            @click="close"
          />
          <UButton
            type="submit"
            label="Send"
            icon="i-lucide-send"
            :loading="loading"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
