import { beforeEach, describe, expect, test } from 'bun:test'
import {
  DEFAULT_SETTINGS,
  fetchCommentSettings,
  gateFor,
  isCompleteSettings,
  normalizeSettings,
  resetSettingsCache,
  resolveSettings,
} from './settings'

const served = {
  version: 1,
  access: 'login',
  bodyLimit: 500,
  anonEditWindowMinutes: 0,
  turnstileSiteKey: '0x-public',
  features: { votes: false },
}

describe('normalizeSettings', () => {
  test('passes a well-formed document through', () => {
    expect(normalizeSettings(served)).toEqual({
      access: 'login',
      bodyLimit: 500,
      anonEditWindowMinutes: 0,
      turnstileSiteKey: '0x-public',
      features: { votes: false },
    })
  })

  test('voting is on unless the document turns it off, and an older service that sends no flag keeps it on', () => {
    expect(normalizeSettings({ ...served, features: { votes: true } })?.features.votes).toBe(true)
    expect(normalizeSettings({ ...served, features: undefined })?.features.votes).toBe(true)
    expect(normalizeSettings({ ...served, features: { votes: 'no' } })?.features.votes).toBe(true)
  })

  test('rejects a non-object', () => {
    expect(normalizeSettings(null)).toBeNull()
    expect(normalizeSettings('settings')).toBeNull()
  })

  test('fails open on unknown or out-of-range values, so a widget never hides a thread by mistake', () => {
    expect(normalizeSettings({ ...served, access: 'public' })?.access).toBe('open')
    expect(normalizeSettings({ ...served, bodyLimit: 0 })?.bodyLimit).toBe(10_000)
    expect(normalizeSettings({ ...served, bodyLimit: 12.5 })?.bodyLimit).toBe(10_000)
    expect(normalizeSettings({ ...served, bodyLimit: 99_999 })?.bodyLimit).toBe(10_000)
    expect(normalizeSettings({ ...served, anonEditWindowMinutes: -1 })?.anonEditWindowMinutes).toBe(10)
  })

  test('a blank Turnstile key is no key', () => {
    expect(normalizeSettings({ ...served, turnstileSiteKey: '   ' })?.turnstileSiteKey).toBeNull()
    expect(normalizeSettings({ ...served, turnstileSiteKey: null })?.turnstileSiteKey).toBeNull()
  })
})

describe('resolveSettings', () => {
  test('an explicit prop beats the supplied object, which beats the fetched document, which beats the default', () => {
    const fetched = normalizeSettings(served)
    const resolved = resolveSettings({ bodyLimit: 4096 }, { bodyLimit: 2000, access: 'private' }, fetched)
    expect(resolved.bodyLimit).toBe(4096)
    expect(resolved.access).toBe('private')
    expect(resolved.anonEditWindowMinutes).toBe(0)
  })

  test('an undefined prop never overrides the document', () => {
    const resolved = resolveSettings({ bodyLimit: undefined }, undefined, normalizeSettings(served))
    expect(resolved.bodyLimit).toBe(500)
  })

  test('with nothing fetched and nothing supplied, the built-in defaults apply', () => {
    expect(resolveSettings({}, undefined, null)).toEqual(DEFAULT_SETTINGS)
  })
})

describe('isCompleteSettings', () => {
  test('true only when the host supplied every field', () => {
    expect(isCompleteSettings(DEFAULT_SETTINGS)).toBe(true)
    expect(isCompleteSettings({ access: 'open', bodyLimit: 500 })).toBe(false)
    expect(isCompleteSettings(undefined)).toBe(false)
  })

  test('a host that predates the vote flag still gets the document, so the flag is known', () => {
    const { features: _features, ...withoutFlag } = DEFAULT_SETTINGS
    expect(isCompleteSettings(withoutFlag)).toBe(false)
  })
})

describe('the vote flag', () => {
  test('a host prop can turn voting off over the document', () => {
    const fetched = normalizeSettings({ ...served, features: { votes: true } })
    expect(resolveSettings({}, { features: { votes: false } }, fetched).features.votes).toBe(false)
  })
})

describe('gateFor', () => {
  test('open admits everyone to read and write', () => {
    expect(gateFor('open', 'read', false)).toBe('allow')
    expect(gateFor('open', 'write', false)).toBe('allow')
  })

  test('login admits anonymous reads and asks for sign-in to write', () => {
    expect(gateFor('login', 'read', false)).toBe('allow')
    expect(gateFor('login', 'write', false)).toBe('sign-in')
  })

  test('private asks for sign-in to read and to write', () => {
    expect(gateFor('private', 'read', false)).toBe('sign-in')
    expect(gateFor('private', 'write', false)).toBe('sign-in')
  })

  test('a signed-in viewer always passes', () => {
    expect(gateFor('private', 'read', true)).toBe('allow')
    expect(gateFor('login', 'write', true)).toBe('allow')
  })
})

describe('fetchCommentSettings', () => {
  beforeEach(() => resetSettingsCache())

  function fakeFetch(body: unknown, init: { status?: number } = {}) {
    const calls: { url: string; credentials: unknown }[] = []
    const fetchImpl = (async (url: string | URL | Request, options?: RequestInit) => {
      calls.push({ url: String(url), credentials: options?.credentials })
      return Response.json(body, { status: init.status ?? 200 })
    }) as typeof fetch
    return { calls, fetchImpl }
  }

  test('reads the public document for the site with no cookies and returns it normalized', async () => {
    const { calls, fetchImpl } = fakeFetch({ data: { settings: served } })
    const result = await fetchCommentSettings({ baseUrl: 'https://c.test/', site: 'lst97-dev', fetchImpl })
    expect(result?.access).toBe('login')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://c.test/api/comments/settings?site=lst97-dev')
    expect(calls[0]?.credentials).toBe('omit')
  })

  test('a second read within a minute is served from the cache', async () => {
    const { calls, fetchImpl } = fakeFetch({ data: { settings: served } })
    const now = () => 1_000
    await fetchCommentSettings({ baseUrl: 'https://c.test', site: 's', fetchImpl, now })
    await fetchCommentSettings({ baseUrl: 'https://c.test', site: 's', fetchImpl, now: () => 30_000 })
    expect(calls).toHaveLength(1)
  })

  test('the cache expires after a minute', async () => {
    const { calls, fetchImpl } = fakeFetch({ data: { settings: served } })
    await fetchCommentSettings({ baseUrl: 'https://c.test', site: 's', fetchImpl, now: () => 0 })
    await fetchCommentSettings({ baseUrl: 'https://c.test', site: 's', fetchImpl, now: () => 61_000 })
    expect(calls).toHaveLength(2)
  })

  test('concurrent reads share one request', async () => {
    const { calls, fetchImpl } = fakeFetch({ data: { settings: served } })
    await Promise.all([
      fetchCommentSettings({ baseUrl: 'https://c.test', site: 's', fetchImpl }),
      fetchCommentSettings({ baseUrl: 'https://c.test', site: 's', fetchImpl }),
    ])
    expect(calls).toHaveLength(1)
  })

  test('an older service without the endpoint (404) resolves to null, and is not cached', async () => {
    const missing = fakeFetch({ error: { code: 'NOT_FOUND', message: 'nope' } }, { status: 404 })
    expect(
      await fetchCommentSettings({ baseUrl: 'https://c.test', site: 's', fetchImpl: missing.fetchImpl }),
    ).toBeNull()
    const working = fakeFetch({ data: { settings: served } })
    expect(
      (await fetchCommentSettings({ baseUrl: 'https://c.test', site: 's', fetchImpl: working.fetchImpl }))?.access,
    ).toBe('login')
  })

  test('a network failure resolves to null instead of throwing', async () => {
    const offline = (async () => {
      throw new TypeError('network down')
    }) as unknown as typeof fetch
    expect(await fetchCommentSettings({ baseUrl: 'https://c.test', site: 's', fetchImpl: offline })).toBeNull()
  })

  test('a malformed body resolves to null', async () => {
    const { fetchImpl } = fakeFetch({ data: { settings: 'not an object' } })
    expect(await fetchCommentSettings({ baseUrl: 'https://c.test', site: 's', fetchImpl })).toBeNull()
  })
})
