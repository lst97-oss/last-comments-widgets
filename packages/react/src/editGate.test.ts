import { describe, expect, test } from 'bun:test'
import { DEFAULT_EDIT_WINDOW_MINUTES } from '@last-comments/client'
import { canEditComment } from './editGate'

const own = (minutesAgo: number, userId = 'u1') => ({
  userId,
  createdAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
})

describe('canEditComment', () => {
  test('hidden on a 6-minute-old own comment with the default window', () => {
    expect(canEditComment(own(6), 'u1', DEFAULT_EDIT_WINDOW_MINUTES)).toBe(false)
  })

  test('shown when editWindowMinutes is 0 (unlimited)', () => {
    expect(canEditComment(own(6), 'u1', 0)).toBe(true)
  })

  test('hidden for other viewers and guests', () => {
    expect(canEditComment(own(1), 'u2', 0)).toBe(false)
    expect(canEditComment(own(1), undefined, 0)).toBe(false)
  })
})
