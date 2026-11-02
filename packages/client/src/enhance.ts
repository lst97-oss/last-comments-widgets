// The DOM upgrades the four widgets share: KaTeX math, Mermaid diagrams, the SVG check and the
// Turnstile loader. Built as its own entry, so a host that imports only the client never loads
// KaTeX or Mermaid, and the modules are not part of the public `/client` surface.
export { enhanceMath, type MathOptions } from './enhance/math'
export { enhanceMermaid } from './enhance/mermaid'
export { isSafeSvg, isUnsafeElement, parseSafeSvg, type SafeElement } from './enhance/svg'
export * from './enhance/turnstile'
