<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRuntimeConfig } from '#imports'
// `@nuxt/ui` is a peer dependency; import its composables from its public API so
// the module typechecks in isolation. At runtime this resolves to the same
// singleton the host auto-imports.
import { defineShortcuts } from '@nuxt/ui/composables'
import { MAX_ELEMENTS, pickedNodes, useFeedback } from '../composables/useFeedback'
import { getBreadcrumbs } from '../utils/activityBuffer'
import { collectEnvironment } from '../utils/environment'
import { elementLabel, screenshot } from '../utils/elementPicker'
import { hideMarkers, showMarkers } from '../utils/markers'
import { recordSubmission } from '../utils/submissionStore'
import type { FeedbackElement, FeedbackSeverity, FeedbackType, PublicFeedbackConfig } from '../types'

/**
 * The feedback panel: docked to the bottom-right corner so the page (and the
 * numbered outlines of the picked elements) stay visible while the reporter
 * writes. The shortcut goes straight to the element picker.
 */

const { isOpen, isPicking, type, elements, capturing, submit, close, pick, removeElement, clearElements, openHistory, fetchIdentity } = useFeedback()
const config = useRuntimeConfig().public.feedback as PublicFeedbackConfig

const typeItems = [
  { label: 'Bug', value: 'bug', icon: 'i-lucide-bug' },
  { label: 'Idea', value: 'feature', icon: 'i-lucide-lightbulb' },
] satisfies Array<{ label: string, value: FeedbackType, icon: string }>

const severityItems = [
  { label: 'Cosmetic', value: 'cosmetic' },
  { label: 'Annoying', value: 'annoying' },
  { label: 'Blocking', value: 'blocking' },
  { label: 'Critical', value: 'critical' },
] satisfies Array<{ label: string, value: FeedbackSeverity }>

const placeholder: Record<FeedbackType, string> = {
  bug: 'What\'s wrong? What did you expect?',
  feature: 'What would make this better?',
}

const state = reactive<{ message: string, email: string, severity: FeedbackSeverity | null }>({
  message: '',
  email: '',
  severity: null,
})

const sending = ref(false)
const error = ref<string | null>(null)
const filed = ref<{ number: number, url: string } | null>(null)
const textarea = ref<{ textareaRef?: HTMLTextAreaElement } | null>(null)

// Only ask for an email when we don't already know who they are.
const identified = ref<boolean | null>(null)
onMounted(async () => {
  identified.value = await fetchIdentity().then(r => r.identified).catch(() => false)
})

const visible = computed(() => isOpen.value && !isPicking.value)
const emailValid = computed(() => !state.email || /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(state.email))
const canSend = computed(() => !!state.message.trim() && emailValid.value && !sending.value && capturing.value === 0)

// The shortcut goes straight to picking; Escape in the picker opens the panel without an element.
if (config?.shortcut) {
  defineShortcuts({ [config.shortcut]: () => pick() })
}

// Keep the picks outlined while the panel is up; focus the message when it appears.
watch([visible, elements], ([show]) => {
  if (show && !filed.value) showMarkers([...pickedNodes])
  else hideMarkers()
})
watch(visible, async (show) => {
  if (!show) return
  await nextTick()
  textarea.value?.textareaRef?.focus()
})
onBeforeUnmount(hideMarkers)

function describeSub(el: FeedbackElement): string | undefined {
  const file = el.components?.find(c => c.includes('/') || c.includes('.vue'))
  if (file) return (/\(([^()]+)\)$/.exec(file)?.[1] ?? file).split('/').slice(-2).join('/')
  return el.section?.heading ? `in "${el.section.heading}"` : el.selector
}

function toggleSeverity(value: FeedbackSeverity) {
  state.severity = state.severity === value ? null : value
}

function reset() {
  state.message = ''
  state.email = ''
  state.severity = null
  error.value = null
  clearElements()
}

function dismiss() {
  close()
  if (filed.value) {
    filed.value = null
    reset()
  }
}

function another() {
  filed.value = null
  reset()
  nextTick(() => textarea.value?.textareaRef?.focus())
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    dismiss()
  }
  else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    send()
  }
}

async function send() {
  if (!canSend.value) return
  sending.value = true
  error.value = null
  const isBug = type.value === 'bug'
  try {
    // A bug without a picked element gets a shot of what's on screen instead.
    const pageShot = isBug && config?.screenshots && !elements.value.length
      ? await screenshot(null).catch(() => undefined)
      : undefined
    const res = await submit({
      type: type.value,
      message: state.message,
      email: state.email || undefined,
      context: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        app: config?.app,
        version: config?.version,
        ts: new Date().toISOString(),
        environment: collectEnvironment(),
        ...(elements.value.length ? { elements: elements.value } : {}),
        ...(pageShot ? { screenshot: pageShot } : {}),
        ...(isBug ? { severity: state.severity ?? undefined, breadcrumbs: getBreadcrumbs() } : {}),
      },
    })
    if (!res?.issue) throw new Error('No issue returned')
    recordSubmission({
      type: type.value,
      issueNumber: res.issue.number,
      issueUrl: res.issue.url,
      title: state.message.trim().split('\n')[0]!.slice(0, 100) || `${type.value} report`,
      submittedAt: new Date().toISOString(),
    })
    filed.value = res.issue
    hideMarkers()
  }
  catch {
    error.value = 'That didn\'t send. Mind trying again?'
  }
  finally {
    sending.value = false
  }
}
</script>

<template>
  <Transition name="fb-panel">
    <section
      v-if="visible"
      data-feedback-ui
      class="fb-panel"
      role="dialog"
      aria-label="Send feedback"
      @keydown="onKeydown"
    >
      <header class="fb-head">
        <div
          class="fb-seg"
          role="tablist"
        >
          <button
            v-for="item in typeItems"
            :key="item.value"
            type="button"
            role="tab"
            class="fb-seg-item"
            :aria-selected="type === item.value"
            @click="type = item.value"
          >
            <UIcon
              :name="item.icon"
              class="fb-icon"
            />
            {{ item.label }}
          </button>
        </div>
        <div class="fb-head-actions">
          <UButton
            icon="i-lucide-inbox"
            label="Your reports"
            variant="ghost"
            color="neutral"
            size="xs"
            @click="dismiss(); openHistory()"
          />
          <UButton
            icon="i-lucide-x"
            aria-label="Close"
            variant="ghost"
            color="neutral"
            size="xs"
            @click="dismiss()"
          />
        </div>
      </header>

      <div
        v-if="filed"
        class="fb-body fb-done"
      >
        <UIcon
          name="i-lucide-circle-check"
          class="fb-done-icon"
        />
        <p class="fb-done-title">
          Filed as #{{ filed.number }}. Thanks!
        </p>
        <div class="fb-row">
          <UButton
            :to="filed.url"
            target="_blank"
            label="View issue"
            icon="i-lucide-external-link"
            variant="soft"
            color="neutral"
            size="sm"
          />
          <UButton
            label="Send another"
            variant="ghost"
            color="neutral"
            size="sm"
            @click="another()"
          />
        </div>
      </div>

      <form
        v-else
        class="fb-body"
        @submit.prevent="send()"
      >
        <ul
          v-if="elements.length"
          class="fb-elements"
        >
          <li
            v-for="(el, i) in elements"
            :key="i"
            class="fb-element"
          >
            <span class="fb-num">{{ i + 1 }}</span>
            <div class="fb-element-text">
              <span class="fb-element-label">{{ elementLabel(el) }}</span>
              <span class="fb-element-sub">{{ describeSub(el) }}</span>
            </div>
            <img
              v-if="el.screenshot"
              :src="el.screenshot"
              alt=""
              class="fb-thumb"
            >
            <UButton
              icon="i-lucide-x"
              :aria-label="`Remove element ${i + 1}`"
              variant="ghost"
              color="neutral"
              size="xs"
              @click="removeElement(i)"
            />
          </li>
        </ul>

        <UButton
          v-if="elements.length < MAX_ELEMENTS"
          :label="elements.length ? 'Point at another element' : 'Point at the element you mean'"
          icon="i-lucide-mouse-pointer-click"
          :variant="elements.length ? 'link' : 'soft'"
          color="neutral"
          size="sm"
          class="fb-pick"
          @click="pick()"
        />

        <UTextarea
          ref="textarea"
          v-model="state.message"
          :placeholder="placeholder[type]"
          :rows="3"
          :maxrows="10"
          autoresize
          class="fb-full"
        />

        <div
          v-if="type === 'bug'"
          class="fb-row fb-severity"
        >
          <span class="fb-muted">How bad?</span>
          <UButton
            v-for="item in severityItems"
            :key="item.value"
            :label="item.label"
            :variant="state.severity === item.value ? 'soft' : 'outline'"
            :color="state.severity === item.value ? 'warning' : 'neutral'"
            size="xs"
            class="fb-chip"
            @click="toggleSeverity(item.value)"
          />
        </div>

        <UInput
          v-if="identified === false"
          v-model="state.email"
          type="email"
          placeholder="Your email (optional)"
          :color="emailValid ? undefined : 'error'"
          class="fb-full"
        />

        <p
          v-if="error"
          class="fb-error"
        >
          {{ error }}
        </p>

        <footer class="fb-foot">
          <span class="fb-muted fb-hint">⌘↵ to send · Esc to close</span>
          <UButton
            type="submit"
            :label="capturing ? 'Capturing…' : 'Send'"
            icon="i-lucide-send"
            :loading="sending || capturing > 0"
            :disabled="!canSend"
          />
        </footer>
      </form>
    </section>
  </Transition>
</template>

<style scoped>
/* Plain CSS on Nuxt UI's variables: host apps don't run Tailwind over module files. */
.fb-panel {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483640;
  width: min(380px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  background: var(--ui-bg);
  color: var(--ui-text);
  border: 1px solid var(--ui-border);
  border-radius: calc(var(--ui-radius, 0.25rem) * 3);
  box-shadow: 0 16px 48px rgb(0 0 0 / 0.25);
  font-size: 0.875rem;
}
.fb-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 8px 8px 12px;
  border-bottom: 1px solid var(--ui-border);
}
.fb-head-actions { display: flex; gap: 2px; }
.fb-seg {
  display: inline-flex;
  padding: 2px;
  border-radius: calc(var(--ui-radius, 0.25rem) * 2);
  background: var(--ui-bg-elevated);
}
.fb-seg-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border: 0;
  border-radius: calc(var(--ui-radius, 0.25rem) * 1.5);
  background: transparent;
  color: var(--ui-text-muted);
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}
.fb-seg-item[aria-selected="true"] {
  background: var(--ui-bg);
  color: var(--ui-text-highlighted);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.15);
}
.fb-icon { width: 14px; height: 14px; }
.fb-body { display: flex; flex-direction: column; gap: 10px; padding: 12px; }
.fb-full { width: 100%; }
.fb-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.fb-muted { color: var(--ui-text-muted); font-size: 0.75rem; }
.fb-pick { align-self: flex-start; }
.fb-elements { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
.fb-element {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px 6px 8px;
  border: 1px dashed #e11d48;
  border-radius: calc(var(--ui-radius, 0.25rem) * 2);
  background: color-mix(in srgb, #e11d48 6%, transparent);
}
.fb-num {
  flex: none;
  width: 18px;
  height: 18px;
  border-radius: 9999px;
  background: #e11d48;
  color: #fff;
  font: 600 11px/18px system-ui, sans-serif;
  text-align: center;
}
.fb-element-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.fb-element-label, .fb-element-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fb-element-sub { color: var(--ui-text-muted); font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.6875rem; }
.fb-thumb { flex: none; width: 40px; height: 28px; object-fit: contain; background: var(--ui-bg-elevated); border-radius: 4px; border: 1px solid var(--ui-border); }
.fb-chip { border-radius: 9999px; }
.fb-error { margin: 0; color: var(--ui-error); font-size: 0.8125rem; }
.fb-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.fb-done { align-items: center; text-align: center; padding: 20px 12px; }
.fb-done-icon { width: 28px; height: 28px; color: var(--ui-success); }
.fb-done-title { margin: 0; font-weight: 600; }
.fb-panel-enter-active, .fb-panel-leave-active { transition: opacity 120ms ease, transform 120ms ease; }
.fb-panel-enter-from, .fb-panel-leave-to { opacity: 0; transform: translateY(8px); }
@media (max-width: 480px) {
  .fb-panel { right: 8px; left: 8px; bottom: 8px; width: auto; }
  .fb-hint { display: none; }
}
</style>
