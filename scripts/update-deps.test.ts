import { describe, expect, test } from 'bun:test'
import { lockVersions, satisfies } from './update-deps'

describe('lockVersions', () => {
  test('reads scoped and unscoped packages from the lock file', () => {
    const lock = [
      '    "@angular/core": ["@angular/core@22.2.3", "", { "dependencies": {} }, "sha512-x=="],',
      '    "@biomejs/biome": ["@biomejs/biome@2.6.4", "", {}, "sha512-y=="],',
      '    "katex": ["katex@0.19.1", "", {}, "sha512-z=="],',
    ].join('\n')
    const versions = lockVersions(lock)
    expect(versions.get('@angular/core')).toBe('22.2.3')
    expect(versions.get('@biomejs/biome')).toBe('2.6.4')
    expect(versions.get('katex')).toBe('0.19.1')
  })
})

describe('satisfies', () => {
  test('a caret range keeps the major for 1.x and later', () => {
    expect(satisfies('^1.2.3', '1.9.0')).toBe(true)
    expect(satisfies('^1.2.3', '2.0.0')).toBe(false)
  })

  test('a caret range with a zero major keeps the minor, as npm does', () => {
    expect(satisfies('^0.19.1', '0.19.9')).toBe(true)
    expect(satisfies('^0.19.1', '0.20.0')).toBe(false)
    expect(satisfies('^0.7.1', '0.8.0')).toBe(false)
  })

  test('a tilde range keeps the minor, and exact ranges match only that version', () => {
    expect(satisfies('~3.5.44', '3.5.50')).toBe(true)
    expect(satisfies('~3.5.44', '3.6.0')).toBe(false)
    expect(satisfies('1.59.0', '1.59.1')).toBe(false)
  })
})
