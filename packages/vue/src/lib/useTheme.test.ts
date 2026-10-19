import { describe, expect, test } from 'bun:test'
import { resolveDark } from './useTheme'

describe('resolveDark', () => {
  test('fixed modes ignore the media query', () => {
    expect(resolveDark('dark', false)).toBe(true)
    expect(resolveDark('light', true)).toBe(false)
  })

  test('system and unset follow the media query', () => {
    expect(resolveDark('system', true)).toBe(true)
    expect(resolveDark('system', false)).toBe(false)
    expect(resolveDark(undefined, true)).toBe(true)
    expect(resolveDark(undefined, false)).toBe(false)
  })
})
