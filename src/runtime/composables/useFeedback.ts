import { useState } from '#imports'
import type { FeedbackPayload, FeedbackResponse, FeedbackType } from '../types'

/**
 * Controls the feedback dialog and submits reports.
 *
 * Shared open/type state lives in Nuxt's `useState`, so calling `open()` from
 * anywhere in the app drives the single auto-mounted `<FeedbackDialog>`.
 */
export function useFeedback() {
  const isOpen = useState<boolean>('floo-feedback:open', () => false)
  const type = useState<FeedbackType>('floo-feedback:type', () => 'bug')

  /** Open the dialog, optionally preselecting a feedback type. */
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

  /** Submit a feedback report to the server route. */
  function submit(payload: FeedbackPayload) {
    return $fetch<FeedbackResponse>('/api/__feedback', {
      method: 'POST',
      body: payload,
    })
  }

  return { isOpen, type, open, close, submit }
}
