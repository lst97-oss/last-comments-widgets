import { describe, expect, test } from 'bun:test'
import type { Comment, ThreadNode } from '@last-comments-widgets/client'
import { applyVoteOverlay } from './types'

function comment(id: string, parentId: string | null = null): Comment {
  return {
    id,
    pageId: 'page',
    parentId,
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
  }
}

function node(value: Comment, children: ThreadNode[] = []): ThreadNode {
  return { comment: value, children }
}

const child = node(comment('child', 'root'))
const root = node(comment('root'), [child])
const untouched = node(comment('other'))
const tree = [root, untouched]

describe('applyVoteOverlay', () => {
  test('patches the voted row and keeps untouched nodes by identity', () => {
    const result = applyVoteOverlay(tree, { root: { score: 1, viewerVote: 1 } })
    expect(result).not.toBe(tree)
    expect(result[0].comment.score).toBe(1)
    expect(result[0].comment.viewerVote).toBe(1)
    expect(result[0]).not.toBe(root)
    expect(result[0].children[0]).toBe(child)
    expect(result[1]).toBe(untouched)
    expect(result[0].comment.bodyMarkdown).toBe('root')
  })

  test('patches a nested row through the path only', () => {
    const result = applyVoteOverlay(tree, { child: { score: -1, viewerVote: -1 } })
    expect(result[0].children[0].comment.score).toBe(-1)
    expect(result[0].children[0]).not.toBe(child)
    expect(result[0]).not.toBe(root)
    expect(result[0].children).not.toBe(root.children)
    expect(result[1]).toBe(untouched)
  })

  test('empty overlay returns the input array', () => {
    expect(applyVoteOverlay(tree, {})).toBe(tree)
  })

  test('unknown ids are ignored', () => {
    expect(applyVoteOverlay(tree, { missing: { score: 5, viewerVote: 1 } })).toBe(tree)
  })
})
