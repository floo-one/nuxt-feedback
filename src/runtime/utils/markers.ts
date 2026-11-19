import { FEEDBACK_UI_ATTR } from './elementPicker'

/**
 * Numbered outlines over the picked elements while the panel is open, so the
 * reporter can see what each number in the panel refers to. They follow
 * scrolling and resizing; an element that left the DOM loses its outline.
 */

let layer: HTMLDivElement | null = null
let targets: Element[] = []
let frame = 0

function draw() {
  frame = 0
  if (!layer) return
  layer.replaceChildren(...targets.flatMap((el, i) => {
    if (!el.isConnected) return []
    const r = el.getBoundingClientRect()
    const box = document.createElement('div')
    Object.assign(box.style, {
      position: 'fixed',
      top: `${r.top - 3}px`,
      left: `${r.left - 3}px`,
      width: `${r.width + 6}px`,
      height: `${r.height + 6}px`,
      border: '2px solid #e11d48',
      borderRadius: '4px',
      pointerEvents: 'none',
    })
    const badge = document.createElement('div')
    badge.textContent = String(i + 1)
    Object.assign(badge.style, {
      position: 'absolute',
      top: '-10px',
      right: '-10px',
      width: '18px',
      height: '18px',
      borderRadius: '9999px',
      background: '#e11d48',
      color: '#fff',
      font: '600 11px/18px system-ui, sans-serif',
      textAlign: 'center',
    })
    box.append(badge)
    return [box]
  }))
}

function schedule() {
  frame ||= requestAnimationFrame(draw)
}

/** Outline these elements (numbered in order), replacing any previous outlines. */
export function showMarkers(elements: Element[]) {
  targets = elements
  if (!targets.length) return hideMarkers()
  if (!layer) {
    layer = document.createElement('div')
    layer.setAttribute(FEEDBACK_UI_ATTR, '')
    Object.assign(layer.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483645' })
    document.body.append(layer)
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
  }
  draw()
}

/** Remove all outlines. */
export function hideMarkers() {
  targets = []
  if (frame) cancelAnimationFrame(frame)
  frame = 0
  window.removeEventListener('scroll', schedule, true)
  window.removeEventListener('resize', schedule)
  layer?.remove()
  layer = null
}
