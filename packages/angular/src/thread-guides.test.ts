import { describe, expect, test } from 'bun:test'
import type { ThreadNode } from '@last-comments-widgets/client'
import { pickActive, threadSignature } from './thread-guides'

function node(id: string, children: ThreadNode[] = []): ThreadNode {
  return {
    comment: {
      id,
      pageId: 'page',
      parentId: null,
      userId: null,
      authorName: id,
      bodyMarkdown: id,
      status: 'visible',
      pinnedAt: null,
      createdAt: '2026-10-16T00:00:00.000Z',
      editedAt: null,
      score: 0,
      viewerVote: null,
      authorRole: null,
    },
    children,
  }
}

describe('threadSignature', () => {
  test('flattens ids in render order, nesting children in parentheses', () => {
    expect(threadSignature([node('a'), node('b', [node('c'), node('d', [node('e')])])])).toBe('a,b(c,d(e))')
  })

  test('an empty list has an empty signature', () => {
    expect(threadSignature([])).toBe('')
  })
})

describe('pickActive', () => {
  test('picks the last comment that starts above the band', () => {
    const spans = new Map<string, [number, number]>([
      ['a', [0, 40]],
      ['b', [40, 80]],
      ['c', [120, 160]],
    ])
    expect(pickActive(spans, 100)).toBe('b')
  })

  test('nothing reached the band yet: the first row reads as current', () => {
    const spans = new Map<string, [number, number]>([
      ['a', [30, 70]],
      ['b', [80, 120]],
    ])
    expect(pickActive(spans, 10)).toBe('a')
  })

  test('empty spans have no active row', () => {
    expect(pickActive(new Map(), 0)).toBeNull()
  })
})
