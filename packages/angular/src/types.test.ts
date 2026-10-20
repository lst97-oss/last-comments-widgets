import { describe, expect, test } from 'bun:test'
import { DEFAULT_ANON_EDIT_WINDOW_MINUTES } from '@last-comments-widgets/client'
import { canEditComment, resolveTurnstileConfig } from './types'

describe('canEditComment', () => {
  const oldButInside = new Date(Date.now() - 6 * 60_000).toISOString()
  const expired = new Date(Date.now() - 11 * 60_000).toISOString()

  test('signed-in owner edits any time', () => {
    expect(DEFAULT_ANON_EDIT_WINDOW_MINUTES).toBe(10)
    expect(canEditComment({ userId: 'u1', createdAt: expired }, 'u1')).toBe(true)
  })

  test('another viewer never edits', () => {
    expect(canEditComment({ userId: 'u1', createdAt: oldButInside }, 'u2')).toBe(false)
  })

  test('guest edits inside the anonymous window while the browser holds the key', () => {
    expect(canEditComment({ userId: null, createdAt: oldButInside }, undefined, { hasEditKey: true })).toBe(true)
  })

  test('guest without the key is closed', () => {
    expect(canEditComment({ userId: null, createdAt: oldButInside }, undefined)).toBe(false)
  })

  test('guest with the key but past the window is closed', () => {
    expect(canEditComment({ userId: null, createdAt: expired }, undefined, { hasEditKey: true })).toBe(false)
  })

  test('anonWindowMinutes 0 means unlimited', () => {
    expect(
      canEditComment({ userId: null, createdAt: expired }, undefined, { hasEditKey: true, anonWindowMinutes: 0 }),
    ).toBe(true)
  })
})

describe('resolveTurnstileConfig', () => {
  test('follows the widget light/dark mode unless the host overrides the theme', () => {
    expect(resolveTurnstileConfig(true)).toEqual({ theme: 'dark' })
    expect(resolveTurnstileConfig(false)).toEqual({ theme: 'light' })
    expect(resolveTurnstileConfig(true, { theme: 'light' })).toEqual({ theme: 'light' })
    expect(resolveTurnstileConfig(false, { theme: 'auto' })).toEqual({ theme: 'auto' })
  })

  test('forwards the Cloudflare design knobs and omits unset ones', () => {
    expect(resolveTurnstileConfig(false, { size: 'compact', appearance: 'interaction-only', language: 'de' })).toEqual({
      theme: 'light',
      size: 'compact',
      appearance: 'interaction-only',
      language: 'de',
    })
    expect(resolveTurnstileConfig(true, { size: 'flexible' })).toEqual({ theme: 'dark', size: 'flexible' })
  })
})
