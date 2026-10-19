import { describe, expect, test } from 'bun:test'
import { renderMarkdown } from '@last-comments-widgets/client'
import { canEditComment, toggleVoteValue } from './types'

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

describe('canEditComment', () => {
  test('a signed-in owner edits any time', () => {
    const own = { userId: 'u1', createdAt: '2020-01-01T00:00:00.000Z' }
    expect(canEditComment(own, 'u1')).toBe(true)
    expect(canEditComment(own, 'u2')).toBe(false)
    expect(canEditComment(own, undefined)).toBe(false)
  })

  test('a guest edits only while this browser holds the key and the window is open', () => {
    const guest = { userId: null, createdAt: new Date().toISOString() }
    expect(canEditComment(guest, undefined, { hasEditKey: true })).toBe(true)
    expect(canEditComment(guest, undefined, { hasEditKey: false })).toBe(false)
  })

  test('the anonymous window closes the guest editor', () => {
    const guest = { userId: null, createdAt: '2020-01-01T00:00:00.000Z' }
    expect(canEditComment(guest, undefined, { hasEditKey: true, anonWindowMinutes: 10 })).toBe(false)
    expect(canEditComment(guest, undefined, { hasEditKey: true, anonWindowMinutes: 0 })).toBe(true)
  })
})
