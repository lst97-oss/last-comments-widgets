import { describe, expect, test } from 'bun:test'
import { normalizeCodeLanguage, rememberBounded } from './codeBlock'

describe('normalizeCodeLanguage', () => {
  test('accepts the markdown language class and common casing', () => {
    expect(normalizeCodeLanguage('language-ts')).toBe('ts')
    expect(normalizeCodeLanguage('TS')).toBe('ts')
    expect(normalizeCodeLanguage('tsx')).toBe('tsx')
  })

  test('keeps the language id characters Shiki understands', () => {
    expect(normalizeCodeLanguage('c++')).toBe('c++')
    expect(normalizeCodeLanguage('c#')).toBe('c#')
    expect(normalizeCodeLanguage('objective-c')).toBe('objective-c')
    expect(normalizeCodeLanguage('language-')).toBe('text')
  })

  test('falls back to text for missing or junk values', () => {
    expect(normalizeCodeLanguage(undefined)).toBe('text')
    expect(normalizeCodeLanguage(null)).toBe('text')
    expect(normalizeCodeLanguage('  ')).toBe('text')
    expect(normalizeCodeLanguage('foo bar/../')).toBe('foobar')
  })
})

describe('rememberBounded', () => {
  test('keeps at most the limit and drops the oldest entries first', () => {
    const cache = new Map<string, string>()
    rememberBounded(cache, 'a', '1', 2)
    rememberBounded(cache, 'b', '2', 2)
    rememberBounded(cache, 'c', '3', 2)
    expect([...cache.keys()]).toEqual(['b', 'c'])
  })

  test('re-storing a key moves it to the newest end instead of duplicating it', () => {
    const cache = new Map<string, string>()
    rememberBounded(cache, 'a', '1', 2)
    rememberBounded(cache, 'b', '2', 2)
    rememberBounded(cache, 'a', '1', 2)
    rememberBounded(cache, 'c', '3', 2)
    expect([...cache.keys()]).toEqual(['a', 'c'])
  })
})
