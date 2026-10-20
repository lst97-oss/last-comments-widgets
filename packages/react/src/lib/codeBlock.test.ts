import { describe, expect, test } from 'bun:test'
import { normalizeCodeLanguage } from './codeBlock'

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
