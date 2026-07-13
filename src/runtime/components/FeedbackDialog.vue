<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { z } from 'zod'
import { useRuntimeConfig } from '#imports'
// `@nuxt/ui` is a peer dependency; import its composables from its public API so
// the module typechecks in isolation. At runtime this resolves to the same
// singleton the host auto-imports, so toasts surface through the host's <UApp>.
import { defineShortcuts, useToast } from '@nuxt/ui/composables'
import { useFeedback } from '../composables/useFeedback'
import { getConsoleErrors } from '../utils/consoleBuffer'
import type { FeedbackSeverity, FeedbackType, PublicFeedbackConfig } from '../types'

const { isOpen, type, submit, close, fetchIdentity } = useFeedback()
const toast = useToast()
const config = useRuntimeConfig().public.feedback as PublicFeedbackConfig

const typeItems = [
  { label: 'Bug', value: 'bug', icon: 'i-lucide-bug' },
  { label: 'Idea', value: 'feature', icon: 'i-lucide-lightbulb' },
] satisfies Array<{ label: string, value: FeedbackType, icon: string }>

const severityItems = [
  { label: 'Blocking', value: 'blocking' },
  { label: 'Annoying', value: 'annoying' },
  { label: 'Cosmetic', value: 'cosmetic' },
] satisfies Array<{ label: string, value: FeedbackSeverity }>

const schema = z.object({
  type: z.enum(['bug', 'feature']),
  message: z.string().trim().min(1, 'Add a quick note first').max(5000, 'That\'s a bit long'),
  email: z.union([z.literal(''), z.email('That email looks off')]).optional(),
})

const state = reactive<{ type: FeedbackType, message: string, email: string, severity: FeedbackSeverity }>({
  type: type.value,
  message: '',
  email: '',
  severity: 'annoying',
})

// Keep the tabs in sync when opened programmatically with a type.
watch(type, value => (state.type = value))

const loading = ref(false)

// Only ask for an email when we don't already know who they are.
const identified = ref<boolean | null>(null)
const showEmail = computed(() => identified.value === false)
onMounted(async () => {
  identified.value = await fetchIdentity().then(r => r.identified).catch(() => false)
})

// Open the dialog with the configured shortcut.
if (config?.shortcut) {
  defineShortcuts({ [config.shortcut]: () => (isOpen.value = true) })
}

const copy = {
  bug: {
    title: 'Something broken?',
    description: 'Tell us what happened and we\'ll dig in.',
    placeholder: 'What happened? What were you trying to do?',
  },
  feature: {
    title: 'Got an idea?',
    description: 'What would make this better for you?',
    placeholder: 'What would you like to see?',
  },
} satisfies Record<FeedbackType, { title: string, description: string, placeholder: string }>

const current = computed(() => copy[state.type])

async function onSubmit() {
  loading.value = true
  const isBug = state.type === 'bug'
  try {
    const res = await submit({
      type: state.type,
      message: state.message,
      email: state.email || undefined,
      context: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        app: config?.app,
        version: config?.version,
        ts: new Date().toISOString(),
        // Bug-only signal: severity + a snapshot of recent console errors.
        ...(isBug ? { severity: state.severity, consoleErrors: getConsoleErrors() } : {}),
      },
    })
    const issue = res?.issue
    toast.add({
      title: issue ? `Filed as #${issue.number} — thanks! 🙌` : 'Got it — thanks! 🙌',
      color: 'success',
      icon: 'i-lucide-circle-check',
      actions: issue
        ? [{
            label: 'View',
            icon: 'i-lucide-external-link',
            color: 'neutral',
            variant: 'outline',
            onClick: () => {
              window.open(issue.url, '_blank', 'noopener')
            },
          }]
        : undefined,
    })
    state.message = ''
    state.email = ''
    close()
  }
  catch {
    toast.add({
      title: 'That didn\'t send',
      description: 'Mind trying again?',
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
    :title="current.title"
    :description="current.description"
  >
    <template #body>
      <UForm
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UTabs
          v-model="state.type"
          :items="typeItems"
          :content="false"
          color="primary"
          class="w-full"
        />

        <UFormField
          v-if="state.type === 'bug'"
          name="severity"
          label="Severity"
        >
          <USelect
            v-model="state.severity"
            :items="severityItems"
            class="w-full"
          />
        </UFormField>

        <UFormField name="message">
          <UTextarea
            v-model="state.message"
            :rows="5"
            autofocus
            class="w-full"
            :placeholder="current.placeholder"
          />
        </UFormField>

        <UFormField
          v-if="showEmail"
          name="email"
          label="Your email"
          hint="optional"
        >
          <UInput
            v-model="state.email"
            type="email"
            class="w-full"
            placeholder="you@team.com"
          />
        </UFormField>

        <UButton
          type="submit"
          label="Send"
          icon="i-lucide-send"
          :loading="loading"
          block
        />
      </UForm>
    </template>
  </UModal>
</template>
