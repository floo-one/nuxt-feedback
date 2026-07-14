import { useState } from '#imports'
import type { FeedbackIdentity, FeedbackPayload, FeedbackResponse, FeedbackStatus, FeedbackThread, FeedbackThreadMessage, FeedbackType } from '../types'

/**
 * Controls the feedback dialog and submits reports.
 *
 * Shared open/type state lives in Nuxt's `useState`, so calling `open()` from
 * anywhere in the app drives the single auto-mounted `<FeedbackDialog>`.
 */
export function useFeedback() {
  const isOpen = useState<boolean>('floo-feedback:open', () => false)
  const type = useState<FeedbackType>('floo-feedback:type', () => 'bug')
  const isHistoryOpen = useState<boolean>('floo-feedback:history-open', () => false)

  /** Open the dialog, optionally preselecting a type ('bug' | 'feature'). */
  function open(initialType?: FeedbackType) {
    if (initialType) {
      type.value = initialType
    }
    isOpen.value = true
  }

  /** Close the dialog. */
  function close() {
    isOpen.value = false
  }

  /** Open the "your reports" history drawer. */
  function openHistory() {
    isHistoryOpen.value = true
  }

  /** Close the history drawer. */
  function closeHistory() {
    isHistoryOpen.value = false
  }

  /** Submit a report to the server route. */
  function submit(payload: FeedbackPayload) {
    return $fetch<FeedbackResponse>('/api/__feedback', {
      method: 'POST',
      body: payload,
    })
  }

  /**
   * Ask the server (via the host's resolveUser hook) whether the current user is
   * known. The dialog uses this to skip the email field when we already have them.
   */
  function fetchIdentity() {
    return $fetch<FeedbackIdentity>('/api/__feedback/identity')
  }

  /** Refresh open/closed state for the given issue numbers (history drawer). */
  function fetchStatus(numbers: number[]) {
    if (numbers.length === 0) return Promise.resolve<FeedbackStatus[]>([])
    return $fetch<FeedbackStatus[]>('/api/__feedback/status', {
      query: { numbers: numbers.join(',') },
    })
  }

  /** Load one issue's comment thread. */
  function fetchThread(number: number) {
    return $fetch<FeedbackThread>('/api/__feedback/thread', { query: { number } })
  }

  /** Post a reply on an issue on the reporter's behalf. */
  function postComment(number: number, message: string) {
    return $fetch<FeedbackThreadMessage>('/api/__feedback/thread', {
      method: 'POST',
      body: { number, message },
    })
  }

  return {
    isOpen,
    type,
    isHistoryOpen,
    open,
    close,
    openHistory,
    closeHistory,
    submit,
    fetchIdentity,
    fetchStatus,
    fetchThread,
    postComment,
  }
}
