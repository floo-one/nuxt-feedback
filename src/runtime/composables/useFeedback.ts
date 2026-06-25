import { useState } from '#imports'
import type { FeedbackIdentity, FeedbackPayload, FeedbackResponse, FeedbackType } from '../types'

/**
 * Controls the feedback dialog and submits reports.
 *
 * Shared open/type state lives in Nuxt's `useState`, so calling `open()` from
 * anywhere in the app drives the single auto-mounted `<FeedbackDialog>`.
 */
export function useFeedback() {
  const isOpen = useState<boolean>('floo-feedback:open', () => false)
  const type = useState<FeedbackType>('floo-feedback:type', () => 'bug')

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

  return { isOpen, type, open, close, submit, fetchIdentity }
}
