import { relative } from 'node:path'

/** The attribute the picker reads to name the component file behind an element. */
export const SOURCE_ATTR = 'data-fb-src'

// Minimal shapes of the Vue compiler AST, so the module needs no @vue/compiler-core dependency.
const NODE_ROOT = 0
const NODE_ELEMENT = 1
const NODE_TEXT = 2
const NODE_ATTRIBUTE = 6
// v-if / v-for wrap their element in these; they're looked through like wrappers.
const STRUCTURAL = new Set([9, 10, 11])
const TAG_COMPONENT = 1
const TAG_SLOT = 2
const TAG_TEMPLATE = 3

interface AstNode {
  type: number
  tag?: string
  tagType?: number
  props?: unknown[]
  loc: unknown
}

interface TransformContext {
  filename: string
  parent: AstNode | null
}

/**
 * Vue compiler node transform that stamps the outermost native elements of the
 * app's own SFCs with `data-fb-src="<path relative to the workspace>"`. Wrapper
 * components (`<UApp>`, `<UDashboardPanel>`, `<template #body>`) are looked
 * through rather than stamped: attributes don't reliably fall through library
 * components to the DOM. Library files (under node_modules) are left alone. The
 * same compiler options run for the server and client builds, so hydration sees
 * identical markup.
 */
export function sourceAttributeTransform(workspaceDir: string) {
  // Components and slot templates with no native element above them in their
  // template. Transforms run parent-first, so a parent is recorded before its
  // children are visited.
  const wrappers = new WeakSet<AstNode>()
  return (node: AstNode, context: TransformContext) => {
    const parent = context.parent
    if (!parent || (parent.type !== NODE_ROOT && !wrappers.has(parent))) return
    if (STRUCTURAL.has(node.type)) {
      wrappers.add(node)
      return
    }
    if (node.type !== NODE_ELEMENT || node.tagType === TAG_SLOT) return
    if (node.tagType === TAG_COMPONENT || node.tagType === TAG_TEMPLATE) {
      wrappers.add(node)
      return
    }
    const file = context.filename
    if (!file?.endsWith('.vue') || file.includes('/node_modules/')) return
    const path = relative(workspaceDir, file).split('\\').join('/')
    node.props?.push({
      type: NODE_ATTRIBUTE,
      name: SOURCE_ATTR,
      nameLoc: node.loc,
      value: { type: NODE_TEXT, content: path, loc: node.loc },
      loc: node.loc,
    })
  }
}
