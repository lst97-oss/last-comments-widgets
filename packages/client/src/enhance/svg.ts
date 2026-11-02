// The check an SVG must pass before a widget puts Mermaid's output on the page. Mermaid
// sanitizes its own output in strict mode; this is the second lock. It walks the parsed
// tree, not the text: a text check misses `<g/onmouseover=…>` (no space before the handler)
// and entity-encoded links, because the browser reads both differently from the raw string.

// Tags that run script or load another document, whatever their attributes.
const BLOCKED_TAGS: readonly string[] = ['script', 'iframe', 'embed', 'object']

// A `javascript:` URL, after the browser's own cleanup of whitespace and control characters.
function isScriptUrl(value: string): boolean {
  return /^javascript:/i.test(value.replace(/[\s\p{Cc}]/gu, ''))
}

export type SafeElement = { localName: string; attributes: ArrayLike<{ name: string; value: string }> }

// True when one parsed element must be dropped. Attribute values arrive already decoded, so an
// entity-encoded `&#106;avascript:` reads as `javascript:` here.
export function isUnsafeElement(element: SafeElement): boolean {
  if (BLOCKED_TAGS.includes(element.localName.toLowerCase())) return true
  return Array.from(element.attributes).some(({ name, value }) => /^on/i.test(name) || isScriptUrl(value))
}

// Parses Mermaid's markup into an inert tree and returns its root, or null when the markup is not
// an svg or any element in it fails the check. Callers insert the returned element, never the text.
export function parseSafeSvg(svg: string): SVGSVGElement | null {
  const template = document.createElement('template')
  template.innerHTML = svg.trim()
  const rendered = template.content.firstElementChild
  if (!(rendered instanceof SVGSVGElement)) return null
  // querySelectorAll skips the root, so the root is checked on its own.
  const unsafe = [rendered, ...rendered.querySelectorAll('*')].some(isUnsafeElement)
  return unsafe ? null : rendered
}

export function isSafeSvg(svg: string): boolean {
  return parseSafeSvg(svg) !== null
}
