import { describe, expect, test } from 'bun:test'
import { canEditComment } from './editGate'

const own = (minutesAgo: number, userId: string | null = 'u1') => ({
  userId,
  createdAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
})

describe('canEditComment', () => {
  test('signed-in owners edit any time', () => {
    expect(canEditComment(own(30 * 24 * 60), 'u1')).toBe(true)
  })

  test('guests edit their own comment with a stored key inside the anonymous window', () => {
    expect(canEditComment(own(9, null), undefined, { hasEditKey: true })).toBe(true)
    expect(canEditComment(own(11, null), undefined, { hasEditKey: true })).toBe(false)
    expect(canEditComment(own(11, null), undefined, { hasEditKey: true, anonWindowMinutes: 0 })).toBe(true)
  })

  test('guests without a key never edit, even inside the window', () => {
    expect(canEditComment(own(1, null), undefined, { hasEditKey: false })).toBe(false)
    expect(canEditComment(own(1, null), undefined)).toBe(false)
  })

  test('hidden for other viewers and for a guest viewing a signed-in comment', () => {
    expect(canEditComment(own(1), 'u2')).toBe(false)
    expect(canEditComment(own(1), undefined, { hasEditKey: true })).toBe(false)
  })

  test('a signed-in viewer may edit their own anonymous post by key', () => {
    expect(canEditComment(own(9, null), 'u1', { hasEditKey: true })).toBe(true)
    expect(canEditComment(own(11, null), 'u1', { hasEditKey: true })).toBe(false)
  })
})
