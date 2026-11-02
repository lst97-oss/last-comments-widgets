import { describe, expect, test } from 'bun:test'
import { isUnsafeElement, type SafeElement } from './svg'

// The predicate takes what a parse produces, so these cases name attributes the way the parser
// does. That the parser sees `<g/onmouseover=…>` as a handler is checked in a real browser by
// scripts/check-svg.ts, because bun has no DOM to parse with.
function element(localName: string, attributes: Record<string, string> = {}): SafeElement {
  return { localName, attributes: Object.entries(attributes).map(([name, value]) => ({ name, value })) }
}

describe('isUnsafeElement', () => {
  test('drops script, iframe, embed and object whatever their attributes', () => {
    for (const tag of ['script', 'iframe', 'embed', 'object', 'SCRIPT']) {
      expect(isUnsafeElement(element(tag))).toBe(true)
    }
  })

  test('drops any event handler, however the parser named it', () => {
    expect(isUnsafeElement(element('g', { onmouseover: 'alert(1)' }))).toBe(true)
    expect(isUnsafeElement(element('svg', { onload: 'alert(1)' }))).toBe(true)
  })

  test('drops a javascript: url, including one with whitespace or control characters inside it', () => {
    expect(isUnsafeElement(element('a', { href: 'javascript:alert(1)' }))).toBe(true)
    expect(isUnsafeElement(element('a', { href: 'JaVaScRiPt:alert(1)' }))).toBe(true)
    expect(isUnsafeElement(element('a', { href: 'java\tscript:alert(1)' }))).toBe(true)
    expect(isUnsafeElement(element('a', { href: '\u0001javascript:alert(1)' }))).toBe(true)
  })

  test('keeps the markup a Mermaid diagram emits', () => {
    expect(isUnsafeElement(element('svg', { viewBox: '0 0 10 10', xmlns: 'http://www.w3.org/2000/svg' }))).toBe(false)
    expect(isUnsafeElement(element('g', { class: 'node' }))).toBe(false)
    expect(isUnsafeElement(element('foreignObject'))).toBe(false)
    expect(isUnsafeElement(element('a', { href: '#node-1' }))).toBe(false)
  })

  test('a tag named like an Object.prototype key is not a blocked tag', () => {
    expect(isUnsafeElement(element('constructor'))).toBe(false)
  })
})
