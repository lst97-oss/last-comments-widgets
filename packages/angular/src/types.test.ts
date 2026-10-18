import { describe, expect, test } from 'bun:test'
import { DEFAULT_EDIT_WINDOW_MINUTES } from '@lst97-oss/client'
import { canEditComment } from './types'

describe('canEditComment', () => {
  test('Edit hidden on a 6-minute-old own comment with the default window', () => {
    const createdAt = new Date(Date.now() - 6 * 60_000).toISOString()
    expect(DEFAULT_EDIT_WINDOW_MINUTES).toBe(5)
    expect(canEditComment({ userId: 'u1', createdAt }, 'u1')).toBe(false)
  })

  test('Edit shown when editWindowMinutes is 0 (unlimited)', () => {
    const createdAt = new Date(Date.now() - 6 * 60_000).toISOString()
    expect(canEditComment({ userId: 'u1', createdAt }, 'u1', 0)).toBe(true)
  })
})
