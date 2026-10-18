import { describe, expect, test } from 'bun:test'
import { renderMarkdown } from '@lst97-oss/client'
import { canShowEdit, toggleVoteValue } from './types'

describe('toggleVoteValue', () => {
  test('clears the active vote, sets a new one', () => {
    expect(toggleVoteValue(1, 1)).toBe('clear')
    expect(toggleVoteValue(null, -1)).toBe(-1)
    expect(toggleVoteValue(-1, 1)).toBe(1)
  })
})

describe('renderMarkdown parity', () => {
  test('renders GFM and strips raw HTML plus unsafe links', () => {
    const html = renderMarkdown('**b** <script>x</script> [e](javascript:alert(1))')
    expect(html).toContain('<strong>b</strong>')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('javascript:')
  })

  test('allows http(s) links and renders tables with breaks', () => {
    expect(renderMarkdown('[ok](https://a.b)')).toContain('<a href="https://a.b"')
    expect(renderMarkdown('*i* ~~s~~ `c`\nnext')).toContain('<em>i</em>')
    expect(renderMarkdown('| a |\n| - |\n| b |')).toContain('<table>')
  })
})

describe('canShowEdit', () => {
  test('hidden on 6-minute-old own comment, shown when unlimited', () => {
    const createdAt = '2026-10-16T00:00:00.000Z'
    const nowMs = Date.parse('2026-10-16T00:06:00.000Z')
    const own = { userId: 'u1', createdAt }
    expect(canShowEdit('u1', own, undefined, nowMs)).toBe(false)
    expect(canShowEdit('u1', own, 0, nowMs)).toBe(true)
    expect(canShowEdit('u2', own, 0, nowMs)).toBe(false)
    expect(canShowEdit(undefined, own, 0, nowMs)).toBe(false)
  })
})
