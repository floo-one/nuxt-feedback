import type { FeedbackElement } from '../types'

/**
 * Point-and-click element picker. While active, the element under the pointer
 * is outlined; a click picks it (and is swallowed, so links and buttons don't
 * fire), Escape cancels. The capture side (`describeElement`) turns the pick
 * into a `FeedbackElement` that tells a developer where to look.
 */

/** Set at build time on the app's own component roots (`sourceAttribute` option). */
const SOURCE_ATTR = 'data-fb-src'

/** Marks the module's own nodes so they can't be picked. */
export const FEEDBACK_UI_ATTR = 'data-feedback-ui'
const FEEDBACK_ROOTS = '#floo-feedback-root,#floo-feedback-history-root'

export function isFeedbackUi(el: Element): boolean {
  return !!el.closest(`[${FEEDBACK_UI_ATTR}],${FEEDBACK_ROOTS}`)
}

/** Clicks inside an SVG (paths of a logo or icon) pick the whole SVG. */
export function pickable(el: Element): Element {
  return el.closest('svg') ?? el
}

/** Readable, reasonably stable CSS path: up to the nearest id or landmark, nth-of-type where needed. */
export function cssPath(el: Element): string {
  const parts: string[] = []
  let node: Element | null = el
  while (node && node !== document.body && node !== document.documentElement && parts.length < 8) {
    const tag = node.tagName.toLowerCase()
    if (node.id) {
      parts.unshift(`#${CSS.escape(node.id)}`)
      break
    }
    const current: Element = node
    const sameTag = current.parentElement ? [...current.parentElement.children].filter(c => c.tagName === current.tagName) : []
    parts.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${sameTag.indexOf(current) + 1})` : tag)
    if (['header', 'main', 'footer', 'nav', 'aside'].includes(tag)) break
    node = node.parentElement
  }
  return parts.join(' > ')
}

function clip(s: string | null | undefined, n: number): string | undefined {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t ? (t.length > n ? `${t.slice(0, n - 1)}…` : t) : undefined
}

interface VueInstanceLike {
  type?: { __name?: string, name?: string, __file?: string }
  parent?: VueInstanceLike | null
}

/** A source path relative to the workspace root, else from its app/, layers/ or packages/ folder. */
function relativeFile(file: string, root?: string): string {
  if (root && file.startsWith(`${root}/`)) return file.slice(root.length + 1)
  return file.replace(/^.*?\/((app|components|pages|layouts|layers?|packages)\/)/, '$1')
}

/** Framework plumbing that says nothing about where the code lives. */
const SKIP_COMPONENT = /^(?:Primitive.*|.*Slot|.*Provider|.*Base|UApp|RouterView|RouterLink|NuxtRoot|NuxtLayout|NuxtPage|NuxtLink|NuxtErrorBoundary|ClientOnly|Suspense|Transition|KeepAlive|Teleport)$/

/** Component files stamped on the element's ancestors by the `sourceAttribute` build option, innermost first. */
export function stampedSources(el: Element, max = 5): string[] {
  const files: string[] = []
  let node = el.closest(`[${SOURCE_ATTR}]`)
  while (node && files.length < max) {
    const file = node.getAttribute(SOURCE_ATTR)!
    if (file !== files[files.length - 1]) files.push(file)
    node = node.parentElement?.closest(`[${SOURCE_ATTR}]`) ?? null
  }
  return files
}

/** Most descendants scanned for dev-mode component info; keeps a huge pick from stalling the page. */
const MAX_SCANNED = 3000

/**
 * The app's own component files rendered inside the element, in page order:
 * what a reporter usually means when they mark a whole area. Read from the
 * `sourceAttribute` stamps, or Vue's dev-mode bookkeeping when there are none.
 */
export function containedSources(el: Element, root?: string, max = 10): string[] {
  const files = new Set<string>()
  for (const node of el.querySelectorAll(`[${SOURCE_ATTR}]`)) {
    if (files.size >= max) break
    files.add(node.getAttribute(SOURCE_ATTR)!)
  }
  if (files.size) return [...files]
  const nodes = el.querySelectorAll('*')
  for (let i = 0; i < nodes.length && i < MAX_SCANNED && files.size < max; i++) {
    const file = (nodes[i] as Element & { __vueParentComponent?: VueInstanceLike }).__vueParentComponent?.type?.__file
    if (file && !file.includes('/node_modules/')) files.add(relativeFile(file, root))
  }
  return [...files]
}

/**
 * Vue component chain around an element, innermost first: the library component
 * that rendered it (e.g. `UButton`), then the app's own components as
 * `Name (path)`. Vue only links DOM nodes to component instances in dev builds,
 * so this is empty in production.
 */
export function componentChain(el: Element, root?: string, max = 5): string[] {
  let instance = (el as Element & { __vueParentComponent?: VueInstanceLike }).__vueParentComponent
  const chain: string[] = []
  let seenOwn = false
  while (instance && chain.length < max) {
    const t = instance.type
    const file = t?.__file
    const name = t?.__name || t?.name || file?.split('/').pop()?.replace(/\.vue$/, '')
    const own = !!file && !file.includes('/node_modules/')
    if (name && own) {
      chain.push(`${name} (${relativeFile(file!, root)})`)
      seenOwn = true
    }
    else if (name && !seenOwn && !chain.length && !SKIP_COMPONENT.test(name)) {
      chain.push(name)
    }
    instance = instance.parent ?? undefined
  }
  return chain
}

/**
 * Linked Nuxt UI cards (UPageCard with `to`) lay an empty `<a aria-label><span class="absolute inset-0">`
 * over the whole card, so every click on the card picks that span. Such a pick is described by the card.
 */
function coveredCard(link: Element): FeedbackElement['card'] | null {
  if (clip(link.textContent, 1) || link.querySelector('img')) return null
  const card = link.parentElement
  if (!card) return null
  const img = card.querySelector('img')
  return {
    title: clip(card.querySelector('[data-slot="title"]')?.textContent ?? link.getAttribute('aria-label'), 120),
    src: img ? img.currentSrc || img.src || undefined : undefined,
  }
}

/** Everything the report records about a picked element. */
export function describeElement(el: Element, root?: string): FeedbackElement {
  const r = el.getBoundingClientRect()
  const img = el instanceof HTMLImageElement ? el : el.querySelector(':scope > img, :scope > picture > img')
  const link = el.closest('a[href]')
  const t: FeedbackElement = {
    selector: cssPath(el),
    tag: el.tagName.toLowerCase(),
    // innerText on purpose: the text the reporter saw, without hidden nodes.
    // eslint-disable-next-line unicorn/prefer-dom-node-text-content
    text: clip((el as HTMLElement).innerText ?? el.textContent, 280),
    alt: clip(el.getAttribute('aria-label') ?? (img as HTMLImageElement | null)?.alt, 280),
    rect: { width: Math.round(r.width), height: Math.round(r.height) },
    href: link?.getAttribute('href') ?? undefined,
  }
  if (img instanceof HTMLImageElement) {
    t.src = img.currentSrc || img.src
    t.natural = { width: img.naturalWidth, height: img.naturalHeight }
  }
  const card = link && !t.text && !t.src ? coveredCard(link) : null
  if (card) t.card = card
  const section = el.closest('section')
  const id = section?.id || undefined
  const heading = clip(section?.querySelector('h1, h2, h3')?.textContent, 120)
  if (id || heading) t.section = { id, heading }
  // Dev builds know the component names; production relies on the build stamp.
  const chain = componentChain(el, root)
  const components = chain.some(c => c.includes('(')) ? chain : stampedSources(el)
  if (components.length) t.components = components
  // Files already named by the chain around the element say nothing new about its content.
  const around = new Set(components.map(c => /\(([^()]+)\)$/.exec(c)?.[1] ?? c))
  const contains = containedSources(el, root).filter(f => !around.has(f))
  if (contains.length) t.contains = contains
  return t
}

/** Short human label for the dialog, e.g. `Button: "Save order"`. */
export function elementLabel(t: FeedbackElement): string {
  if (t.card) return `Card: "${t.card.title ?? t.href ?? ''}"`
  const kind = t.tag === 'img' || t.src
    ? 'Image'
    : t.tag === 'svg'
      ? 'Graphic'
      : /^h[1-6]$/.test(t.tag)
        ? 'Heading'
        : t.tag === 'a' ? 'Link' : t.tag === 'button' ? 'Button' : 'Element'
  const name = t.alt ?? t.text
  return name ? `${kind}: "${name.length > 60 ? `${name.slice(0, 59)}…` : name}"` : `${kind} <${t.tag}>`
}

const MAX_EDGE = 2000
/** Largest screenshot data URL sent (~600 KB of JPEG), so a five-element report stays well under common 2-4 MB body limits. */
const MAX_DATA_URL = 800_000

/** JPEG at decreasing quality, then at half size, until it fits MAX_DATA_URL. */
export function encodeJpeg(canvas: HTMLCanvasElement): string {
  for (const quality of [0.8, 0.65, 0.5]) {
    const url = canvas.toDataURL('image/jpeg', quality)
    if (url.length <= MAX_DATA_URL) return url
  }
  const half = document.createElement('canvas')
  half.width = Math.max(1, Math.round(canvas.width / 2))
  half.height = Math.max(1, Math.round(canvas.height / 2))
  half.getContext('2d')!.drawImage(canvas, 0, 0, half.width, half.height)
  return half.width < 200 ? half.toDataURL('image/jpeg', 0.5) : encodeJpeg(half)
}

/**
 * JPEG data URL of the element with some surroundings: small elements are shot
 * together with an ancestor, outlined in red and cropped around. `null` shoots
 * the visible viewport. The module's own UI is left out.
 */
export async function screenshot(el: Element | null): Promise<string> {
  const { domToCanvas } = await import('modern-screenshot')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const filter = (n: Node) => !(n instanceof Element && isFeedbackUi(n))
  const backgroundColor = getComputedStyle(document.body).backgroundColor

  if (!el) {
    const canvas = await domToCanvas(document.body, {
      width: window.innerWidth,
      height: window.innerHeight,
      scale: Math.min(dpr, MAX_EDGE / Math.max(window.innerWidth, window.innerHeight)),
      backgroundColor,
      filter,
      style: { transform: `translateY(-${window.scrollY}px)` },
    })
    return encodeJpeg(canvas)
  }

  // Small or flat elements read better with context: shoot the nearest ancestor
  // at least 320x160 (wide rows are cropped around the element below).
  let ctx: Element = el
  const small = (e: Element) => {
    const r = e.getBoundingClientRect()
    return r.width < 320 || r.height < 160
  }
  while (small(ctx) && ctx.parentElement && ctx.parentElement !== document.body && ctx.parentElement.getBoundingClientRect().height < 900) {
    ctx = ctx.parentElement
  }

  const box = ctx.getBoundingClientRect()
  const scale = Math.min(dpr, MAX_EDGE / Math.max(box.width, box.height, 1))
  const canvas = await domToCanvas(ctx, { scale, backgroundColor, filter })
  if (ctx === el) return encodeJpeg(canvas)

  // Outline the element, then crop to it plus some surroundings (a wide header would make a logo tiny).
  const r = el.getBoundingClientRect()
  const x = (r.left - box.left) * scale
  const y = (r.top - box.top) * scale
  const w = r.width * scale
  const h = r.height * scale
  const c = canvas.getContext('2d')!
  c.strokeStyle = '#e11d48'
  c.lineWidth = Math.max(2, 3 * scale)
  const pad = 4 * scale
  c.strokeRect(x - pad, y - pad, w + 2 * pad, h + 2 * pad)

  const margin = Math.max(160 * scale, Math.max(w, h) * 0.75)
  const cx = Math.max(0, x - margin)
  const cy = Math.max(0, y - margin)
  const cw = Math.min(canvas.width, x + w + margin) - cx
  const ch = Math.min(canvas.height, y + h + margin) - cy
  const out = document.createElement('canvas')
  out.width = Math.round(cw)
  out.height = Math.round(ch)
  out.getContext('2d')!.drawImage(canvas, cx, cy, cw, ch, 0, 0, out.width, out.height)
  return encodeJpeg(out)
}

/**
 * Let the user pick an element. Resolves with the element, or `null` when
 * cancelled (Escape or a second call). Only one picker runs at a time.
 */
let cancelActive: (() => void) | null = null

export function pickElement(): Promise<Element | null> {
  cancelActive?.()
  return new Promise((resolve) => {
    const outline = document.createElement('div')
    outline.setAttribute(FEEDBACK_UI_ATTR, '')
    Object.assign(outline.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483646',
      border: '2px solid #e11d48',
      background: 'rgba(225, 29, 72, 0.08)',
      borderRadius: '4px',
      transition: 'all 60ms ease-out',
      display: 'none',
    })

    const hint = document.createElement('div')
    hint.setAttribute(FEEDBACK_UI_ATTR, '')
    hint.textContent = 'Click the element you mean · Esc to cancel'
    Object.assign(hint.style, {
      position: 'fixed',
      top: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '2147483647',
      padding: '6px 12px',
      borderRadius: '9999px',
      background: '#111827',
      color: '#fff',
      font: '500 13px/1.4 system-ui, sans-serif',
      boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
      pointerEvents: 'none',
    })

    document.body.append(outline, hint)
    const prevCursor = document.documentElement.style.cursor
    document.documentElement.style.cursor = 'crosshair'

    const target = (e: Event): Element | null => {
      const el = e.target instanceof Element ? pickable(e.target) : null
      return el && !isFeedbackUi(el) ? el : null
    }

    const onMove = (e: MouseEvent) => {
      const el = target(e)
      if (!el) {
        outline.style.display = 'none'
        return
      }
      const r = el.getBoundingClientRect()
      Object.assign(outline.style, {
        display: 'block',
        top: `${r.top - 3}px`,
        left: `${r.left - 3}px`,
        width: `${r.width + 6}px`,
        height: `${r.height + 6}px`,
      })
    }

    // Swallow the whole press so the page doesn't react to the pick.
    const swallow = (e: Event) => {
      if (!target(e)) return
      e.preventDefault()
      e.stopPropagation()
    }

    const onClick = (e: MouseEvent) => {
      const el = target(e)
      if (!el) return
      e.preventDefault()
      e.stopPropagation()
      finish(el)
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      finish(null)
    }

    const listeners: Array<[string, EventListener]> = [
      ['mousemove', onMove as EventListener],
      ['pointerdown', swallow],
      ['mousedown', swallow],
      ['pointerup', swallow],
      ['mouseup', swallow],
      ['click', onClick as EventListener],
      ['keydown', onKey as EventListener],
    ]
    for (const [name, fn] of listeners) document.addEventListener(name, fn, true)

    function finish(result: Element | null) {
      for (const [name, fn] of listeners) document.removeEventListener(name, fn, true)
      outline.remove()
      hint.remove()
      document.documentElement.style.cursor = prevCursor
      cancelActive = null
      resolve(result)
    }

    cancelActive = () => finish(null)
  })
}
