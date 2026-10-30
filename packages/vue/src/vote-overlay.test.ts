import { describe, expect, test } from 'bun:test'
import type { Comment, ThreadNode } from '@last-comments-widgets/client'
import { applyCommentOverlay } from './types'

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
    reactions: [],
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

describe('applyCommentOverlay', () => {
  test('a reaction patch lands on its row and leaves the vote as it was', () => {
    const reactions = [{ emoji: '👍', count: 1, viewerReacted: true }]
    const result = applyCommentOverlay(tree, { child: { reactions } })
    expect(result[0].children[0].comment.reactions).toEqual(reactions)
    expect(result[0].children[0].comment.score).toBe(0)
    expect(result[0].children[0].comment.viewerVote).toBeNull()
  })

  test('patches the voted row and keeps untouched nodes by identity', () => {
    const result = applyCommentOverlay(tree, { root: { score: 1, viewerVote: 1 } })
    expect(result).not.toBe(tree)
    expect(result[0].comment.score).toBe(1)
    expect(result[0].comment.viewerVote).toBe(1)
    expect(result[0]).not.toBe(root)
    expect(result[0].children[0]).toBe(child)
    expect(result[1]).toBe(untouched)
    expect(result[0].comment.bodyMarkdown).toBe('root')
  })

  test('patches a nested row through the path only', () => {
    const result = applyCommentOverlay(tree, { child: { score: -1, viewerVote: -1 } })
    expect(result[0].children[0].comment.score).toBe(-1)
    expect(result[0].children[0]).not.toBe(child)
    expect(result[0]).not.toBe(root)
    expect(result[0].children).not.toBe(root.children)
    expect(result[1]).toBe(untouched)
  })

  test('empty overlay returns the input array', () => {
    expect(applyCommentOverlay(tree, {})).toBe(tree)
  })

  test('unknown ids are ignored', () => {
    expect(applyCommentOverlay(tree, { missing: { score: 5, viewerVote: 1 } })).toBe(tree)
  })
})
