import { describe, expect, test } from 'bun:test'
import { isSafeSvg } from './mermaid'

describe('isSafeSvg', () => {
  test('accepts the markup mermaid emits for a diagram', () => {
    const svg =
      '<svg id="lc-react-mermaid-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g class="node"><text>A</text></g></svg>'
    expect(isSafeSvg(svg)).toBe(true)
  })

  test('rejects script elements', () => {
    expect(isSafeSvg('<svg><script>alert(1)</script></svg>')).toBe(false)
    expect(isSafeSvg('<svg>\n<script\nsrc="x"></script></svg>')).toBe(false)
  })

  test('rejects inline event handlers', () => {
    expect(isSafeSvg('<svg><g onclick="alert(1)"></g></svg>')).toBe(false)
    expect(isSafeSvg('<svg onload = "alert(1)"></svg>')).toBe(false)
  })

  test('rejects javascript urls', () => {
    expect(isSafeSvg('<svg><a href="JavaScript:alert(1)"></a></svg>')).toBe(false)
  })
})
