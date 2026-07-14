<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useFeedback } from '../composables/useFeedback'
import { hasUnread, markThreadViewed, persistStates, readSubmissions } from '../utils/submissionStore'
import type { FeedbackThread, StoredSubmission } from '../types'

// The reports THIS browser has filed, plus a per-report comment thread bridged
// to the GitHub issue. Reads the local record first (instant), refreshes state +
// unread counts from the status endpoint, and polls the open thread for replies.
const { isHistoryOpen, fetchStatus, fetchThread, postComment } = useFeedback()

const POLL_MS = 20_000

const submissions = ref<StoredSubmission[]>([])
const loading = ref(false)

// Thread sub-view state.
const selected = ref<StoredSubmission | null>(null)
const thread = ref<FeedbackThread | null>(null)
const threadLoading = ref(false)
const threadError = ref(false)
const reply = ref('')
const posting = ref(false)
let pollTimer: ReturnType<typeof setInterval> | undefined

// ---- List ----------------------------------------------------------------

async function refresh() {
  submissions.value = readSubmissions()
  const numbers = submissions.value.map(s => s.issueNumber)
  if (numbers.length === 0) return
  loading.value = true
  try {
    const states = await fetchStatus(numbers)
    if (states.length) {
      submissions.value = persistStates(states, new Date().toISOString())
    }
  }
  catch {
    // A failed refresh keeps the last-known states — never fatal.
  }
  finally {
    loading.value = false
  }
}

// ---- Thread --------------------------------------------------------------

async function loadThread(showSpinner = false) {
  const current = selected.value
  if (!current) return
  if (showSpinner) threadLoading.value = true
  try {
    const t = await fetchThread(current.issueNumber)
    thread.value = t
    threadError.value = false
    // Seeing the thread clears its unread state.
    submissions.value = markThreadViewed(current.issueNumber, t.messages.length)
  }
  catch {
    threadError.value = true
  }
  finally {
    threadLoading.value = false
  }
}

function openThread(s: StoredSubmission) {
  selected.value = s
  thread.value = null
  threadError.value = false
  reply.value = ''
  loadThread(true)
  stopPoll()
  pollTimer = setInterval(() => loadThread(false), POLL_MS)
}

function backToList() {
  stopPoll()
  selected.value = null
  thread.value = null
  refresh()
}

async function send() {
  const current = selected.value
  const message = reply.value.trim()
  if (!current || !message) return
  posting.value = true
  try {
    await postComment(current.issueNumber, message)
    reply.value = ''
    await loadThread(false)
  }
  catch {
    threadError.value = true
  }
  finally {
    posting.value = false
  }
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = undefined
  }
}

// Reload the list each time the drawer opens; tear the thread down on close.
watch(isHistoryOpen, (open) => {
  if (open) {
    refresh()
  }
  else {
    stopPoll()
    selected.value = null
    thread.value = null
  }
})

onBeforeUnmount(stopPoll)

// ---- Presentation --------------------------------------------------------

function typeIcon(t: StoredSubmission['type']): string {
  return t === 'bug' ? 'i-lucide-bug' : 'i-lucide-lightbulb'
}

function badge(s: StoredSubmission): { label: string, color: 'success' | 'neutral' } {
  if (s.state === 'closed') return { label: 'Resolved', color: 'success' }
  if (s.state === 'open') return { label: 'Open', color: 'neutral' }
  return { label: 'Sent', color: 'neutral' }
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = then - Date.now()
  const abs = Math.abs(diffMs)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (abs < minute) return 'just now'
  if (abs < hour) return rtf.format(Math.round(diffMs / minute), 'minute')
  if (abs < day) return rtf.format(Math.round(diffMs / hour), 'hour')
  return rtf.format(Math.round(diffMs / day), 'day')
}
</script>

<template>
  <USlideover
    v-model:open="isHistoryOpen"
    :title="selected ? selected.title : 'Your reports'"
    :description="selected ? undefined : 'Bugs and ideas you\'ve sent from this browser.'"
  >
    <template #body>
      <!-- ===== Thread view ===== -->
      <div
        v-if="selected"
        class="flex h-full flex-col"
      >
        <div class="mb-3 flex items-center justify-between gap-2">
          <UButton
            label="All reports"
            icon="i-lucide-arrow-left"
            variant="link"
            color="neutral"
            size="sm"
            class="-ml-2"
            @click="backToList"
          />
          <UButton
            :to="selected.issueUrl"
            target="_blank"
            label="Open in GitHub"
            icon="i-lucide-external-link"
            trailing
            variant="link"
            color="neutral"
            size="sm"
          />
        </div>

        <div class="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <div
            v-if="threadLoading"
            class="py-8 text-center text-sm text-muted"
          >
            Loading replies…
          </div>
          <div
            v-else-if="threadError"
            class="py-8 text-center text-sm text-error"
          >
            Couldn't load replies. They'll retry shortly.
          </div>
          <div
            v-else-if="thread && thread.messages.length === 0"
            class="py-8 text-center text-sm text-muted"
          >
            No replies yet. Add a note below and the team will see it on the issue.
          </div>

          <div
            v-for="m in thread?.messages ?? []"
            :key="m.id"
            class="flex"
            :class="m.origin === 'reporter' ? 'justify-end' : 'justify-start'"
          >
            <div
              class="max-w-[85%] rounded-lg px-3 py-2 text-sm"
              :class="m.origin === 'reporter'
                ? 'bg-primary/10 text-highlighted'
                : 'bg-elevated text-default'"
            >
              <p class="mb-0.5 text-xs text-muted">
                {{ m.origin === 'reporter' ? 'You' : m.author }} · {{ relativeTime(m.createdAt) }}
              </p>
              <p class="whitespace-pre-wrap break-words">
                {{ m.body }}
              </p>
            </div>
          </div>
        </div>

        <form
          class="mt-3 flex items-end gap-2 border-t border-default pt-3"
          @submit.prevent="send"
        >
          <UTextarea
            v-model="reply"
            :rows="1"
            autoresize
            class="flex-1"
            placeholder="Write a reply…"
            :disabled="posting"
          />
          <UButton
            type="submit"
            icon="i-lucide-send"
            :loading="posting"
            :disabled="!reply.trim()"
          />
        </form>
      </div>

      <!-- ===== List view ===== -->
      <template v-else>
        <div
          v-if="submissions.length === 0"
          class="py-10 text-center text-sm text-muted"
        >
          No reports yet. Send one with the feedback shortcut.
        </div>

        <ul
          v-else
          class="space-y-2"
        >
          <li
            v-for="s in submissions"
            :key="s.issueNumber"
          >
            <button
              type="button"
              class="flex w-full items-start gap-3 rounded-lg border border-default p-3 text-left transition-colors hover:bg-elevated"
              @click="openThread(s)"
            >
              <UIcon
                :name="typeIcon(s.type)"
                class="mt-0.5 size-5 shrink-0 text-muted"
              />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-highlighted">
                  {{ s.title }}
                </p>
                <p class="text-xs text-muted">
                  #{{ s.issueNumber }} · {{ relativeTime(s.submittedAt) }}
                </p>
              </div>
              <span
                v-if="hasUnread(s)"
                class="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                aria-label="New reply"
              />
              <UBadge
                :label="badge(s).label"
                :color="badge(s).color"
                variant="subtle"
                size="sm"
                class="shrink-0"
              />
            </button>
          </li>
        </ul>
      </template>
    </template>
  </USlideover>
</template>
