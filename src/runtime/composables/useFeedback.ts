import { useRuntimeConfig, useState } from '#imports'
import { describeElement, pickElement, screenshot } from '../utils/elementPicker'
import type { FeedbackElement, FeedbackIdentity, FeedbackPayload, PublicFeedbackConfig, FeedbackResponse, FeedbackStatus, FeedbackThread, FeedbackThreadMessage, FeedbackType } from '../types'

/** Most elements one report can point at. */
export const MAX_ELEMENTS = 5

/**
 * The DOM nodes behind the picked elements, in the same order as the
 * `elements` state. Kept outside `useState` because nodes aren't serializable;
 * the panel uses them to keep the picks outlined.
 */
export const pickedNodes: Element[] = []

/**
 * Controls the feedback panel and submits reports.
 *
 * Shared open/type state lives in Nuxt's `useState`, so calling `open()` from
 * anywhere in the app drives the single auto-mounted `<FeedbackDialog>`.
 */
export function useFeedback() {
  const config = useRuntimeConfig().public.feedback as PublicFeedbackConfig | undefined
  const isOpen = useState<boolean>('floo-feedback:open', () => false)
  const type = useState<FeedbackType>('floo-feedback:type', () => 'bug')
  const isHistoryOpen = useState<boolean>('floo-feedback:history-open', () => false)
  /** True while the element picker is active (the panel hides meanwhile). */
  const isPicking = useState<boolean>('floo-feedback:picking', () => false)
  /** The elements the reporter pointed at, attached to the next report. */
  const elements = useState<FeedbackElement[]>('floo-feedback:elements', () => [])
  /** Screenshots still being captured; the panel waits for them before sending. */
  const capturing = useState<number>('floo-feedback:capturing', () => 0)

  /** Open the panel, optionally preselecting a type ('bug' | 'feature'). */
  function open(initialType?: FeedbackType) {
    if (initialType) {
      type.value = initialType
    }
    isOpen.value = true
  }

  /**
   * Hide the panel, let the user click the element they mean, then open the
   * panel with it attached. Escape opens the panel without adding anything.
   */
  async function pick(initialType?: FeedbackType) {
    if (initialType) {
      type.value = initialType
    }
    if (isPicking.value || elements.value.length >= MAX_ELEMENTS) {
      isOpen.value = true
      return
    }
    isPicking.value = true
    const node = await pickElement()
    // Picking an element twice adds nothing; the panel just comes back.
    if (node && !pickedNodes.includes(node)) {
      elements.value = [...elements.value, describeElement(node, config?.sourceRoot)]
      pickedNodes.push(node)
      // The screenshot follows a moment later; the panel shows the element right away.
      if (config?.screenshots) {
        capturing.value++
        screenshot(node)
          .then((shot) => {
            // Look the node up again: earlier picks may have been removed meanwhile.
            const index = pickedNodes.indexOf(node)
            if (index < 0) return
            elements.value = elements.value.map((e, i) => (i === index ? { ...e, screenshot: shot } : e))
          })
          .catch(error => console.warn('[feedback] screenshot failed', error))
          .finally(() => capturing.value--)
      }
    }
    isPicking.value = false
    isOpen.value = true
  }

  /** Drop one picked element. */
  function removeElement(index: number) {
    elements.value = elements.value.filter((_, i) => i !== index)
    pickedNodes.splice(index, 1)
  }

  /** Drop all picked elements. */
  function clearElements() {
    elements.value = []
    pickedNodes.length = 0
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
    isPicking,
    elements,
    capturing,
    open,
    pick,
    removeElement,
    clearElements,
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
