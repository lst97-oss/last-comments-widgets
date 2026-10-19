import { describe, expect, test } from 'bun:test'
import {
  ApiError,
  beginOAuthSignIn,
  buildCommentTree,
  buildThreadGuidePath,
  type Comment,
  canModerate,
  collectThreadParticipants,
  createClient,
  DEFAULT_ANON_EDIT_WINDOW_MINUTES,
  DEFAULT_EDIT_WINDOW_MINUTES,
  describeError,
  EDIT_WINDOW_CLOSED,
  fetchViewerSession,
  fetchViewerThreads,
  forgetEditKey,
  formatRelativeTime,
  getEditKey,
  isEditWindowOpen,
  listCommentsPage,
  loadThreadWindow,
  type ModerationComment,
  moderationCommentToComment,
  normalizePageUrl,
  renderMarkdown,
  resolveEditWindow,
  safeUrl,
  saveEditKey,
  signOutViewerSession,
  sortCommentRoots,
  themeVarsToStyle,
} from './index'

function comment(overrides: Partial<Comment>): Comment {
  return {
    id: crypto.randomUUID(),
    pageId: 'page-1',
    parentId: null,
    userId: null,
    authorName: 'Ada',
    bodyMarkdown: 'hello',
    status: 'visible',
    pinnedAt: null,
    createdAt: new Date().toISOString(),
    editedAt: null,
    score: 0,
    viewerVote: null,
    authorRole: null,
    ...overrides,
  }
}

describe('normalizePageUrl', () => {
  test('strips hash and lowercases host', () => {
    expect(normalizePageUrl('https://EXAMPLE.com/post?q=1#frag')).toBe('https://example.com/post?q=1')
  })

  test('rejects non-http and credentialed urls', () => {
    expect(() => normalizePageUrl('ftp://example.com/x')).toThrow()
    expect(() => normalizePageUrl('https://user@example.com/x')).toThrow()
  })
})

describe('safeUrl', () => {
  test('keeps http(s) and relative urls', () => {
    expect(safeUrl('https://a.b/x.png')).toBe('https://a.b/x.png')
    expect(safeUrl('http://a.b/x.png')).toBe('http://a.b/x.png')
    expect(safeUrl('/sign-in')).toBe('/sign-in')
    expect(safeUrl('#anchor')).toBe('#anchor')
  })

  test('rejects schemes, case tricks and control-char smuggling', () => {
    expect(safeUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeUrl('JaVaScRiPt:alert(1)')).toBeUndefined()
    expect(safeUrl(' javascript:alert(1)')).toBeUndefined()
    expect(safeUrl('\u0000javascript:alert(1)')).toBeUndefined()
    expect(safeUrl('java\nscript:alert(1)')).toBeUndefined()
    expect(safeUrl('data:text/html,<script>x</script>')).toBeUndefined()
    expect(safeUrl('vbscript:msgbox(1)')).toBeUndefined()
    expect(safeUrl('file:///etc/passwd')).toBeUndefined()
    expect(safeUrl('')).toBeUndefined()
    expect(safeUrl(undefined)).toBeUndefined()
  })
})

describe('buildCommentTree', () => {
  test('nests replies and keeps orphans at root', () => {
    const parent = comment({ id: 'p' })
    const reply = comment({ id: 'r', parentId: 'p' })
    const orphan = comment({ id: 'o', parentId: 'missing' })
    const tree = buildCommentTree([parent, reply, orphan])
    expect(tree.map((n) => n.comment.id)).toEqual(['p', 'o'])
    expect(tree[0]?.children.map((n) => n.comment.id)).toEqual(['r'])
  })
})

describe('beginOAuthSignIn', () => {
  test('posts provider + callbackURL and returns the provider url', async () => {
    let seen: { url: string; init: RequestInit } | undefined
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      seen = { url: String(url), init: init ?? {} }
      return Response.json({ url: 'https://accounts.google.com/o/oauth2/auth?x=1', redirect: true })
    }) as typeof fetch
    const url = await beginOAuthSignIn({
      baseUrl: 'https://api.test/',
      pageUrl: 'https://demo.test/p',
      fetchImpl,
    })
    expect(url).toBe('https://accounts.google.com/o/oauth2/auth?x=1')
    expect(seen?.url).toBe('https://api.test/api/auth/sign-in/social')
    expect(seen?.init.method).toBe('POST')
    expect(seen?.init.credentials).toBe('include')
    expect(JSON.parse(String(seen?.init.body))).toEqual({
      provider: 'google',
      callbackURL: 'https://demo.test/p',
    })
  })

  test('honours a provider override', async () => {
    let body: unknown
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body))
      return Response.json({ url: 'https://github.com/login/oauth/authorize' })
    }) as typeof fetch
    await beginOAuthSignIn({
      baseUrl: 'https://api.test',
      pageUrl: 'https://demo.test/p',
      provider: 'github',
      fetchImpl,
    })
    expect(body).toEqual({ provider: 'github', callbackURL: 'https://demo.test/p' })
  })

  test('throws SIGN_IN_UNAVAILABLE when the server returns no url', async () => {
    const fetchImpl = (async (_url: string | URL | Request) =>
      Response.json({ message: 'provider not configured' }, { status: 404 })) as typeof fetch
    const err = await beginOAuthSignIn({
      baseUrl: 'https://api.test',
      pageUrl: 'https://demo.test/p',
      fetchImpl,
    }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('SIGN_IN_UNAVAILABLE')
    expect((err as ApiError).message).toBe('provider not configured')
  })
})

describe('fetchViewerSession', () => {
  test('returns the signed-in user and requests the session endpoint with credentials', async () => {
    let seen: { url: string; init: RequestInit | undefined } | undefined
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      seen = { url: String(url), init }
      return Response.json({ user: { id: 'u1', name: 'Ada', image: 'https://a.b/i.png' } })
    }) as typeof fetch
    expect(await fetchViewerSession({ baseUrl: 'https://api.test/', fetchImpl })).toEqual({
      userId: 'u1',
      name: 'Ada',
      image: 'https://a.b/i.png',
    })
    expect(seen?.url).toBe('https://api.test/api/auth/get-session')
    expect(seen?.init?.credentials).toBe('include')
  })

  test('returns null for guests, errors and unusable payloads', async () => {
    const nullBody = (async (_url: string | URL | Request) => Response.json(null)) as typeof fetch
    expect(await fetchViewerSession({ baseUrl: 'https://api.test', fetchImpl: nullBody })).toBeNull()
    const unauthorized = (async (_url: string | URL | Request) =>
      Response.json({ message: 'no' }, { status: 401 })) as typeof fetch
    expect(await fetchViewerSession({ baseUrl: 'https://api.test', fetchImpl: unauthorized })).toBeNull()
    const userless = (async (_url: string | URL | Request) => Response.json({ session: { id: 's1' } })) as typeof fetch
    expect(await fetchViewerSession({ baseUrl: 'https://api.test', fetchImpl: userless })).toBeNull()
    const offline = (async (_url: string | URL | Request): Promise<Response> => {
      throw new Error('offline')
    }) as typeof fetch
    expect(await fetchViewerSession({ baseUrl: 'https://api.test', fetchImpl: offline })).toBeNull()
  })
})

describe('signOutViewerSession', () => {
  test('posts to sign-out with credentials', async () => {
    let seen: { url: string; init: RequestInit | undefined } | undefined
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      seen = { url: String(url), init }
      return Response.json({ success: true })
    }) as typeof fetch
    await signOutViewerSession({ baseUrl: 'https://api.test/', fetchImpl })
    expect(seen?.url).toBe('https://api.test/api/auth/sign-out')
    expect(seen?.init?.method).toBe('POST')
    expect(seen?.init?.credentials).toBe('include')
  })

  test('throws SIGN_OUT_FAILED when the server refuses', async () => {
    const fetchImpl = (async (_url: string | URL | Request) =>
      Response.json({ message: 'no' }, { status: 403 })) as typeof fetch
    const err = await signOutViewerSession({ baseUrl: 'https://api.test', fetchImpl }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('SIGN_OUT_FAILED')
  })
})

describe('createClient', () => {
  test('omits credentials when posting anonymously', async () => {
    let init: RequestInit | undefined
    const fetchImpl = (async (_url: string | URL | Request, i?: RequestInit) => {
      init = i
      return Response.json({ data: { comment: { id: 'c1' } } })
    }) as typeof fetch
    const client = createClient({ baseUrl: 'https://api.test', site: 'demo', fetchImpl })
    await client.postComment({
      url: 'https://demo.test/p',
      bodyMarkdown: 'hello',
      authorName: 'Guest',
      anonymous: true,
    })
    expect(init?.credentials).toBe('omit')
    expect(JSON.parse(String(init?.body)).authorName).toBe('Guest')
  })

  test('returns the guest edit key from the create response untouched', async () => {
    const fetchImpl = (async () =>
      Response.json({ data: { comment: { id: 'c1', editKey: 'secret-key' } } })) as unknown as typeof fetch
    const client = createClient({ baseUrl: 'https://api.test', site: 'demo', fetchImpl })
    const created = await client.postComment({ url: 'https://demo.test/p', bodyMarkdown: 'hi', authorName: 'Guest' })
    expect(created.editKey).toBe('secret-key')
  })

  test('unwraps data envelope and throws ApiError with code', async () => {
    const fetchImpl = (async (url: string | URL | Request) => {
      if (String(url).includes('/api/comments?')) return Response.json({ data: { comments: [] } })
      return Response.json({ error: { code: 'PAGE_LOCKED', message: 'locked' } }, { status: 409 })
    }) as typeof fetch
    const client = createClient({ baseUrl: 'https://api.test', site: 'demo', fetchImpl })
    await expect(client.listComments({ url: 'https://demo.test/p' })).resolves.toEqual([])
    const err = await client.postComment({ url: 'https://demo.test/p', bodyMarkdown: 'x' }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('PAGE_LOCKED')
    expect((err as ApiError).status).toBe(409)
  })

  test('uses the injected fetchImpl instead of global fetch and keeps credentials', async () => {
    const original = globalThis.fetch
    const calls: { url: string; init?: RequestInit }[] = []
    globalThis.fetch = (async () => {
      throw new Error('global fetch must not be called')
    }) as unknown as typeof fetch
    try {
      const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init })
        return Response.json({ data: { comments: [] } })
      }) as typeof fetch
      const client = createClient({ baseUrl: 'https://api.test', site: 'demo', fetchImpl })
      await expect(client.listComments({ url: 'https://demo.test/p' })).resolves.toEqual([])
    } finally {
      globalThis.fetch = original
    }
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toStartWith('https://api.test/api/comments?site=demo&url=')
    expect(calls[0].init?.credentials).toBe('include')
  })

  test('keeps the transport per client instance', async () => {
    const recording = () => {
      const seen: string[] = []
      const fetchImpl = (async (url: string | URL | Request) => {
        seen.push(String(url))
        return Response.json({ data: { comments: [] } })
      }) as unknown as typeof fetch
      return { seen, fetchImpl }
    }
    const a = recording()
    const b = recording()
    const clientA = createClient({ baseUrl: 'https://a.test', site: 'demo', fetchImpl: a.fetchImpl })
    const clientB = createClient({ baseUrl: 'https://b.test', site: 'demo', fetchImpl: b.fetchImpl })
    await clientA.listComments({ url: 'https://demo.test/p' })
    await clientB.listComments({ url: 'https://demo.test/p' })
    expect(a.seen).toHaveLength(1)
    expect(a.seen[0]).toStartWith('https://a.test/api/comments?site=demo&url=')
    expect(b.seen).toHaveLength(1)
    expect(b.seen[0]).toStartWith('https://b.test/api/comments?site=demo&url=')
  })
})

describe('renderMarkdown', () => {
  test('renders GFM and strips raw HTML plus unsafe links', () => {
    const html = renderMarkdown('**b** <script>x</script> [e](javascript:alert(1))')
    expect(html).toContain('<strong>b</strong>')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('javascript:')
  })

  test('allows http(s) links and renders tables with breaks', () => {
    expect(renderMarkdown('[ok](https://a.b)')).toContain('<a href="https://a.b"')
    expect(renderMarkdown('*i* ~~s~~ `c`\nnext')).toContain('<em>i</em>')
    expect(renderMarkdown('| a |\n| - |\n| b |')).toContain('<table>')
  })
})

describe('editOwnComment/deleteOwnComment', () => {
  test('hits /api/comments/:id and unwraps comment envelope', async () => {
    const seen: string[] = []
    const bodies: unknown[] = []
    const row = comment({ id: 'c1' })
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push(`${init?.method} ${String(url)}`)
      if (init?.body) bodies.push(JSON.parse(String(init.body)))
      return Response.json({ data: { comment: row } })
    }) as typeof fetch
    const client = createClient({ baseUrl: 'https://api.test', site: 'demo', fetchImpl })
    await expect(client.editOwnComment({ commentId: 'c1', bodyMarkdown: 'new', editKey: 'key-1' })).resolves.toEqual(
      row,
    )
    expect(bodies).toEqual([{ site: 'demo', bodyMarkdown: 'new', editKey: 'key-1' }])
    await expect(client.deleteOwnComment('c1')).resolves.toEqual(row)
    expect(seen).toEqual([
      'PATCH https://api.test/api/comments/c1',
      'DELETE https://api.test/api/comments/c1?site=demo',
    ])
  })

  test('throws ApiError codes on 404/401', async () => {
    const fetchImpl = (async (url: string | URL | Request) => {
      if (String(url).endsWith('/api/comments/missing?site=demo'))
        return Response.json({ error: { code: 'COMMENT_NOT_FOUND', message: 'not found' } }, { status: 404 })
      return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'sign in' } }, { status: 401 })
    }) as typeof fetch
    const client = createClient({ baseUrl: 'https://api.test', site: 'demo', fetchImpl })
    const missing = await client.deleteOwnComment('missing').catch((e) => e)
    expect((missing as ApiError).code).toBe('COMMENT_NOT_FOUND')
    const denied = await client.editOwnComment({ commentId: 'c1', bodyMarkdown: 'x' }).catch((e) => e)
    expect((denied as ApiError).code).toBe('UNAUTHENTICATED')
    expect((denied as ApiError).status).toBe(401)
  })
})

describe('isEditWindowOpen', () => {
  test('opens inside the window and closes past it', () => {
    const now = Date.parse('2026-10-16T00:05:00.000Z')
    expect(isEditWindowOpen('2026-10-16T00:00:00.000Z', now, 5)).toBe(true)
    expect(isEditWindowOpen('2026-10-15T23:58:00.000Z', now, 5)).toBe(false)
  })

  test('unlimited window and invalid dates', () => {
    expect(DEFAULT_EDIT_WINDOW_MINUTES).toBe(5)
    expect(DEFAULT_ANON_EDIT_WINDOW_MINUTES).toBe(10)
    expect(isEditWindowOpen('2020-01-01T00:00:00.000Z', Date.now(), 0)).toBe(true)
    expect(isEditWindowOpen('2020-01-01T00:00:00.000Z', Date.now(), null)).toBe(true)
    expect(isEditWindowOpen('2020-01-01T00:00:00.000Z', Date.now(), -1)).toBe(false)
    expect(isEditWindowOpen('not-a-date', Date.now(), 5)).toBe(false)
  })
})

describe('resolveEditWindow', () => {
  test('signed-in owners have no window and guest keys use the anonymous window', () => {
    expect(resolveEditWindow({ commentUserId: 'u1', viewerUserId: 'u1' })).toBeNull()
    expect(resolveEditWindow({ commentUserId: null, viewerUserId: undefined, hasEditKey: true })).toBe(10)
    expect(
      resolveEditWindow({ commentUserId: null, viewerUserId: null, hasEditKey: true, anonymousWindowMinutes: 0 }),
    ).toBe(0)
    // A signed-in viewer who posted anonymously still owns the row by key.
    expect(resolveEditWindow({ commentUserId: null, viewerUserId: 'u1', hasEditKey: true })).toBe(10)
  })

  test('closes for anyone who does not own the comment', () => {
    expect(resolveEditWindow({ commentUserId: 'u1', viewerUserId: 'u2' })).toBe(EDIT_WINDOW_CLOSED)
    expect(resolveEditWindow({ commentUserId: 'u1', viewerUserId: undefined })).toBe(EDIT_WINDOW_CLOSED)
    expect(resolveEditWindow({ commentUserId: null, viewerUserId: 'u1' })).toBe(EDIT_WINDOW_CLOSED)
    expect(resolveEditWindow({ commentUserId: null, viewerUserId: undefined })).toBe(EDIT_WINDOW_CLOSED)
  })
})

describe('sortCommentRoots', () => {
  const at = (iso: string, overrides: Partial<Comment> = {}) => comment({ createdAt: iso, ...overrides })
  const older = at('2026-01-01T00:00:00.000Z', { id: 'a' })
  const newer = at('2026-01-02T00:00:00.000Z', { id: 'b' })
  const pinned = at('2026-01-01T12:00:00.000Z', { id: 'c', pinnedAt: '2026-01-03T00:00:00.000Z' })
  const tree = buildCommentTree([older, newer, pinned])

  test('keeps pinned roots first in both directions', () => {
    expect(sortCommentRoots(tree, 'newest').map((node) => node.comment.id)).toEqual(['c', 'b', 'a'])
    expect(sortCommentRoots(tree, 'oldest').map((node) => node.comment.id)).toEqual(['c', 'a', 'b'])
  })

  test('breaks created-at ties by id for a stable order', () => {
    const first = at('2026-01-01T00:00:00.000Z', { id: 'x' })
    const second = at('2026-01-01T00:00:00.000Z', { id: 'y' })
    const tied = buildCommentTree([first, second])
    expect(sortCommentRoots(tied, 'newest').map((node) => node.comment.id)).toEqual(['y', 'x'])
    expect(sortCommentRoots(tied, 'oldest').map((node) => node.comment.id)).toEqual(['x', 'y'])
  })

  test('best ranks by score with pinned first at every depth', () => {
    const parent = at('2026-01-01T00:00:00.000Z', { id: 'p', score: 1 })
    const low = at('2026-01-02T00:00:00.000Z', { id: 'l', parentId: 'p', score: 2 })
    const high = at('2026-01-01T00:00:00.000Z', { id: 'h', parentId: 'p', score: 9 })
    const pinnedReply = at('2026-01-03T00:00:00.000Z', {
      id: 'x',
      parentId: 'p',
      score: -5,
      pinnedAt: '2026-01-04T00:00:00.000Z',
    })
    const nested = buildCommentTree([parent, low, high, pinnedReply])
    expect(sortCommentRoots(nested, 'best')[0]?.children.map((node) => node.comment.id)).toEqual(['x', 'h', 'l'])
  })

  test('best breaks score ties by newest, then id', () => {
    const first = at('2026-01-01T00:00:00.000Z', { id: 'x', score: 4 })
    const second = at('2026-01-02T00:00:00.000Z', { id: 'y', score: 4 })
    const tied = buildCommentTree([first, second])
    expect(sortCommentRoots(tied, 'best').map((node) => node.comment.id)).toEqual(['y', 'x'])
  })

  test('returns a copy and sorts replies by the same comparator', () => {
    const parent = at('2026-01-01T00:00:00.000Z', { id: 'p' })
    const reply = at('2026-01-01T00:00:01.000Z', { id: 'r', parentId: 'p' })
    const pinnedReply = at('2026-01-02T00:00:00.000Z', { id: 'q', parentId: 'p', pinnedAt: '2026-01-03T00:00:00Z' })
    const nested = buildCommentTree([parent, reply, pinnedReply])
    const sorted = sortCommentRoots(nested, 'oldest')
    expect(sorted).not.toBe(nested)
    expect(sorted[0]?.children.map((node) => node.comment.id)).toEqual(['q', 'r'])
  })
})

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-10-19T12:00:00.000Z')

  test('uses Reddit-style short units', () => {
    expect(formatRelativeTime('2026-10-19T12:00:00.000Z', now)).toBe('just now')
    expect(formatRelativeTime('2026-10-19T11:59:30.000Z', now)).toBe('just now')
    expect(formatRelativeTime('2026-10-19T11:55:00.000Z', now)).toBe('5m ago')
    expect(formatRelativeTime('2026-10-19T09:00:00.000Z', now)).toBe('3h ago')
    expect(formatRelativeTime('2026-10-17T12:00:00.000Z', now)).toBe('2d ago')
    expect(formatRelativeTime('2026-09-09T12:00:00.000Z', now)).toBe('1mo ago')
    expect(formatRelativeTime('2025-09-19T12:00:00.000Z', now)).toBe('1y ago')
  })

  test('fails safe for invalid and future dates', () => {
    expect(formatRelativeTime('not-a-date', now)).toBe('')
    expect(formatRelativeTime('2026-10-20T12:00:00.000Z', now)).toBe('just now')
  })
})

describe('collectThreadParticipants', () => {
  test('returns unique reply authors in first-seen order across the subtree', () => {
    const parent = comment({ id: 'p', userId: 'u1', authorName: 'Parent' })
    const reply = comment({
      id: 'r1',
      parentId: 'p',
      userId: 'u2',
      authorName: 'Ada',
      avatarUrl: 'https://a.test/a.png',
    })
    const nested = comment({ id: 'r2', parentId: 'r1', userId: null, authorName: 'Guest' })
    const duplicate = comment({ id: 'r3', parentId: 'p', userId: 'u2', authorName: 'Ada' })
    const tree = buildCommentTree([parent, reply, nested, duplicate])
    // buildCommentTree sees a flat list: reply/nested/duplicate hang off parent.
    const participants = collectThreadParticipants(tree[0]?.children ?? [])
    expect(participants).toEqual([
      { key: 'u2', name: 'Ada', avatarUrl: 'https://a.test/a.png' },
      { key: 'guest:Guest', name: 'Guest', avatarUrl: null },
    ])
  })
})

describe('buildThreadGuidePath', () => {
  test('draws a single rail for one item', () => {
    expect(buildThreadGuidePath([{ x: 0, top: 0, bottom: 100 }])).toEqual({
      d: 'M 0.5 0 L 0.5 100',
      width: 2.5,
      height: 100,
    })
  })

  test('bends into a nested rail with Fumadocs control offsets', () => {
    expect(
      buildThreadGuidePath([
        { x: 0, top: 0, bottom: 100 },
        { x: 16, top: 112, bottom: 200 },
      ]),
    ).toEqual({
      d: 'M 0.5 0 L 0.5 100 C 0.5 108 16.5 104 16.5 112 L 16.5 200',
      width: 18.5,
      height: 200,
    })
  })

  test('keeps peers on one straight line', () => {
    const guide = buildThreadGuidePath([
      { x: 0, top: 0, bottom: 50 },
      { x: 0, top: 60, bottom: 100 },
      { x: 16, top: 110, bottom: 140 },
    ])
    expect(guide.d).toBe('M 0.5 0 L 0.5 50 C 0.5 56 0.5 54 0.5 60 L 0.5 100 C 0.5 106 16.5 104 16.5 110 L 16.5 140')
  })

  test('breaks into a new subpath between threads', () => {
    expect(
      buildThreadGuidePath([
        { x: 16, top: 0, bottom: 100 },
        { x: 16, top: 200, bottom: 240, break: true },
        { x: 48, top: 260, bottom: 300 },
      ]).d,
    ).toBe('M 16.5 0 L 16.5 100M 16.5 200 L 16.5 240 C 16.5 256 48.5 244 48.5 260 L 48.5 300')
  })

  test('returns an empty guide for no items', () => {
    expect(buildThreadGuidePath([])).toEqual({ d: '', width: 0, height: 0 })
  })
})

describe('edit key storage', () => {
  test('round-trips keys and survives unavailable storage', () => {
    const original = globalThis.localStorage
    const values = new Map<string, string>()
    const memory = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    }
    try {
      Object.defineProperty(globalThis, 'localStorage', { value: memory, configurable: true })
      saveEditKey('c1', 'key-1')
      expect(getEditKey('c1')).toBe('key-1')
      forgetEditKey('c1')
      expect(getEditKey('c1')).toBeNull()

      Object.defineProperty(globalThis, 'localStorage', {
        value: {
          getItem: () => {
            throw new Error('denied')
          },
          setItem: () => {
            throw new Error('denied')
          },
          removeItem: () => {
            throw new Error('denied')
          },
        },
        configurable: true,
      })
      expect(() => saveEditKey('c2', 'key-2')).not.toThrow()
      expect(() => forgetEditKey('c2')).not.toThrow()
      expect(getEditKey('c2')).toBeNull()
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { value: original, configurable: true })
    }
  })
})

describe('themeVarsToStyle', () => {
  test('maps popup, state, typography and layout overrides in both modes', () => {
    expect(
      themeVarsToStyle(
        {
          vars: {
            popover: '#fff0f5',
            popoverForeground: '#222',
            accent: '#ffccdd',
            accentForeground: '#111',
            secondary: '#ddd',
            secondaryForeground: '#333',
            destructive: '#c00',
            destructiveForeground: '#fff',
            fontFamily: 'Georgia, serif',
            fontFamilyMono: 'monospace',
            fontSize: '18px',
            lineHeight: '1.8',
            spacing: '0.3rem',
            controlHeight: '2.5rem',
            controlRadius: '4px',
            cardPadding: '2rem',
            composerPadding: '1.5rem',
            dropdownShadow: 'none',
            dialogShadow: 'none',
            backdrop: 'rgb(0 0 0 / .5)',
          },
          dark: { popover: '#221122' },
        },
        true,
      ),
    ).toEqual({
      '--popover': '#221122',
      '--popover-foreground': '#222',
      '--accent': '#ffccdd',
      '--accent-foreground': '#111',
      '--secondary': '#ddd',
      '--secondary-foreground': '#333',
      '--destructive': '#c00',
      '--destructive-foreground': '#fff',
      '--lc-font-family': 'Georgia, serif',
      '--lc-font-family-mono': 'monospace',
      '--lc-font-size': '18px',
      '--lc-line-height': '1.8',
      '--lc-spacing': '0.3rem',
      '--lc-control-height': '2.5rem',
      '--lc-control-radius': '4px',
      '--lc-card-padding': '2rem',
      '--lc-composer-padding': '1.5rem',
      '--lc-dropdown-shadow': 'none',
      '--lc-dialog-shadow': 'none',
      '--lc-backdrop': 'rgb(0 0 0 / .5)',
    })
  })

  test('light picks vars and maps radius', () => {
    expect(themeVarsToStyle({ vars: { primary: '#b91c1c', radius: '1rem' } })).toEqual({
      '--primary': '#b91c1c',
      '--radius': '1rem',
    })
  })

  test('dark merges dark over vars', () => {
    expect(themeVarsToStyle({ vars: { primary: '#b91c1c' }, dark: { primary: '#f87171' } }, true)).toEqual({
      '--primary': '#f87171',
    })
  })

  test('empty and undefined yield no overrides', () => {
    expect(themeVarsToStyle(undefined)).toEqual({})
    expect(themeVarsToStyle({})).toEqual({})
  })

  test('maps reply, vote and action component tokens', () => {
    expect(
      themeVarsToStyle({
        vars: {
          commentBorder: '1px',
          replyBackground: '#f5f5f5',
          threadActive: '#bbb',
          threadMuted: '#ddd',
          avatarRing: '#fff',
          voteBackground: '#eee',
          voteBorder: '1px',
          voteShadow: 'none',
          actionColor: '#666',
          actionHoverColor: '#000',
          actionHoverBackground: '#eee',
        },
      }),
    ).toEqual({
      '--lc-comment-border': '1px',
      '--lc-reply-background': '#f5f5f5',
      '--lc-thread-line': '#bbb',
      '--lc-thread-muted': '#ddd',
      '--lc-avatar-ring': '#fff',
      '--lc-vote-background': '#eee',
      '--lc-vote-border': '1px',
      '--lc-vote-shadow': 'none',
      '--lc-action-color': '#666',
      '--lc-action-hover-color': '#000',
      '--lc-action-hover-background': '#eee',
    })
  })
})

describe('fetchViewerThreads', () => {
  test('groups flat list with orphans at root', async () => {
    const parent = comment({ id: 'p', bodyMarkdown: 'parent' })
    const child = comment({ id: 'c', parentId: 'p', bodyMarkdown: 'child' })
    const orphan = comment({ id: 'o', parentId: 'missing', bodyMarkdown: 'orphan' })
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ data: { comments: [parent, child, orphan] } }), {
        status: 200,
      })) as unknown as typeof fetch
    const tree = await fetchViewerThreads({
      site: 'demo',
      baseUrl: 'https://x.test',
      pageUrl: 'https://x.test/p',
      fetchImpl,
    })
    expect(tree.map((n) => n.comment.id)).toEqual(['p', 'o'])
    expect(tree[0].children.map((n) => n.comment.id)).toEqual(['c'])
  })
})

describe('listCommentsPage', () => {
  const recorder = (rows: unknown[]) => {
    const seen: string[] = []
    const fetchImpl = (async (url: string | URL | Request) => {
      seen.push(String(url))
      return Response.json({ data: { comments: rows } })
    }) as unknown as typeof fetch
    return { seen, fetchImpl }
  }

  test('probes one extra row, trims the page, and reports hasMore', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => comment({ id: `c${i}`, bodyMarkdown: 'x' }))
    const { seen, fetchImpl } = recorder(rows)
    const page = await listCommentsPage({
      site: 'demo',
      baseUrl: 'https://api.test',
      pageUrl: 'https://demo.test/p',
      limit: 2,
      offset: 4,
      fetchImpl,
    })
    expect(page.comments.map((c) => c.id)).toEqual(['c0', 'c1'])
    expect(page.hasMore).toBe(true)
    expect(seen[0]).toInclude('limit=3')
    expect(seen[0]).toInclude('offset=4')
  })

  test('reports the last page when the probe row is missing', async () => {
    const { fetchImpl } = recorder([comment({ id: 'c0', bodyMarkdown: 'x' })])
    const page = await listCommentsPage({
      site: 'demo',
      baseUrl: 'https://api.test',
      pageUrl: 'https://demo.test/p',
      limit: 20,
      fetchImpl,
    })
    expect(page.comments).toHaveLength(1)
    expect(page.hasMore).toBe(false)
  })

  test('caps the probe at the API maximum page size', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => comment({ id: `c${i}`, bodyMarkdown: 'x' }))
    const { seen, fetchImpl } = recorder(rows)
    const page = await listCommentsPage({
      site: 'demo',
      baseUrl: 'https://api.test',
      pageUrl: 'https://demo.test/p',
      limit: 100,
      fetchImpl,
    })
    expect(page.comments).toHaveLength(100)
    expect(page.hasMore).toBe(true)
    expect(seen[0]).toInclude('limit=100')
    expect(seen[0]).not.toInclude('limit=101')
  })
})

describe('loadThreadWindow', () => {
  const stream = (count: number, repliesEvery: number) => {
    const rows: Comment[] = []
    for (let n = 1; n <= count; n++) {
      rows.push(comment({ id: `t${n}`, parentId: null, bodyMarkdown: `T${n}` }))
      if (n % repliesEvery === 0) rows.push(comment({ id: `t${n}r`, parentId: `t${n}`, bodyMarkdown: `R${n}` }))
    }
    return rows
  }
  const stub = (rows: Comment[]) => {
    const seen: string[] = []
    const fetchImpl = (async (url: string | URL | Request) => {
      seen.push(String(url))
      const params = new URLSearchParams(String(url).split('?')[1])
      const offset = Number(params.get('offset') ?? 0)
      const limit = Number(params.get('limit') ?? 20)
      return Response.json({ data: { comments: rows.slice(offset, offset + limit) } })
    }) as unknown as typeof fetch
    return { seen, fetchImpl }
  }
  const roots = (comments: Comment[]) => comments.filter((c) => c.parentId === null).length

  test('fills a whole window of threads even when replies consume rows', async () => {
    const { seen, fetchImpl } = stub(stream(45, 3))
    const window = await loadThreadWindow({
      site: 'demo',
      baseUrl: 'https://api.test',
      pageUrl: 'https://demo.test/p',
      limit: 20,
      fetchImpl,
    })
    const rootIds = window.comments.filter((c) => c.parentId === null).map((c) => c.id)
    expect(rootIds.length).toBeGreaterThanOrEqual(20)
    expect(rootIds.slice(0, 20)).toEqual(Array.from({ length: 20 }, (_, i) => `t${i + 1}`))
    expect(window.hasMore).toBe(true)
    // one request per 20-row batch until 20 threads exist, not a single batch
    expect(seen.length).toBeGreaterThan(1)
  })

  test('continues from the existing rows and reaches the next window', async () => {
    const { fetchImpl } = stub(stream(45, 3))
    const first = await loadThreadWindow({
      site: 'demo',
      baseUrl: 'https://api.test',
      pageUrl: 'https://demo.test/p',
      limit: 20,
      fetchImpl,
    })
    const second = await loadThreadWindow({
      site: 'demo',
      baseUrl: 'https://api.test',
      pageUrl: 'https://demo.test/p',
      limit: 20,
      pages: 2,
      existing: first.comments,
      fetchImpl,
    })
    const rootIds = second.comments.filter((c) => c.parentId === null).map((c) => c.id)
    expect(rootIds.length).toBeGreaterThanOrEqual(40)
    expect(rootIds.slice(0, 40)).toEqual(Array.from({ length: 40 }, (_, i) => `t${i + 1}`))
    expect(second.comments.slice(0, first.comments.length)).toEqual(first.comments)
  })

  test('stops at the end of the stream and reports it', async () => {
    const { fetchImpl } = stub(stream(5, 2))
    const window = await loadThreadWindow({
      site: 'demo',
      baseUrl: 'https://api.test',
      pageUrl: 'https://demo.test/p',
      limit: 20,
      fetchImpl,
    })
    expect(roots(window.comments)).toBe(5)
    expect(window.hasMore).toBe(false)
  })

  test('does not fetch when the window is already filled and survives an empty page', async () => {
    const filled = stream(45, 3).slice(0, 40)
    const { seen, fetchImpl } = stub(filled)
    const window = await loadThreadWindow({
      site: 'demo',
      baseUrl: 'https://api.test',
      pageUrl: 'https://demo.test/p',
      limit: 20,
      existing: filled,
      fetchImpl,
    })
    expect(seen).toHaveLength(0)
    expect(window.comments).toEqual(filled)
    const empty = stub([])
    const none = await loadThreadWindow({
      site: 'demo',
      baseUrl: 'https://api.test',
      pageUrl: 'https://demo.test/p',
      limit: 20,
      fetchImpl: empty.fetchImpl,
    })
    expect(none.comments).toEqual([])
    expect(none.hasMore).toBe(false)
    expect(empty.seen).toHaveLength(1)
  })
})

describe('describeError', () => {
  test('keeps the API message for a specific code and adds its title and action', () => {
    const info = describeError(new ApiError('PAGE_LOCKED', 'Commenting is paused.', 409))
    expect(info).toEqual({
      code: 'PAGE_LOCKED',
      title: 'Comments are closed on this page',
      message: 'Commenting is paused.',
      action: 'none',
    })
  })

  test('uses the caller title for generic codes but keeps the server message', () => {
    const info = describeError(new ApiError('VALIDATION_ERROR', 'A display name is required.', 400), {
      title: "Your comment wasn't posted",
    })
    expect(info.title).toBe("Your comment wasn't posted")
    expect(info.message).toBe('A display name is required.')
    // the composer still holds the text, so no retry button is offered
    expect(info.action).toBe('none')
  })

  test('ignores the synthetic status message and falls back to the code copy', () => {
    const info = describeError(new ApiError('ORIGIN_NOT_ALLOWED', 'request failed with 403', 403))
    expect(info.title).toBe('Comments are unavailable on this page')
    expect(info.message).toContain('allowed origins')
    expect(info.action).toBe('none')
  })

  test('maps fetch rejections to a network notice with a retry', () => {
    expect(describeError(new TypeError('Failed to fetch'))).toEqual({
      code: null,
      title: "Couldn't reach the comments service",
      message: 'Check your connection and try again.',
      action: 'retry',
    })
  })

  test('passes plain errors through with the caller title and offers a retry', () => {
    const info = describeError(new Error('The edit window for this comment has expired.'), { title: 'Edit failed' })
    expect(info).toEqual({
      code: null,
      title: 'Edit failed',
      message: 'The edit window for this comment has expired.',
      action: 'retry',
    })
  })

  test('lets callers override the message for moderation-specific framing', () => {
    const info = describeError(new Error('nope'), {
      title: 'Moderation needs the same-origin API',
      message: 'Serve the moderation routes from this origin.',
    })
    expect(info).toEqual({
      code: null,
      title: 'Moderation needs the same-origin API',
      message: 'Serve the moderation routes from this origin.',
      action: 'retry',
    })
  })
})

describe('moderation client', () => {
  test('listModeration targets /api/moderation with optional pageId, limit, offset', async () => {
    const seen: string[] = []
    const fetchImpl = (async (url: string | URL | Request) => {
      seen.push(String(url))
      return Response.json({ data: { sites: [], pages: [], comments: [], total: 0, isInstanceAdmin: true } })
    }) as unknown as typeof fetch
    const client = createClient({ baseUrl: 'https://api.test', site: 'demo', fetchImpl })
    await client.listModeration({})
    await client.listModeration({ pageId: 'p1', limit: 5, offset: 10 })
    expect(seen).toEqual([
      'https://api.test/api/moderation?site=demo',
      'https://api.test/api/moderation?site=demo&pageId=p1&limit=5&offset=10',
    ])
  })

  test('moderateComment posts the comment target and keeps only id/status/pinnedAt', async () => {
    const calls: { method?: string; url: string; body: Record<string, unknown> }[] = []
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ method: init?.method, url: String(url), body: JSON.parse(String(init?.body)) })
      return Response.json({
        data: { comment: { id: 'c1', pageId: 'p1', bodyMarkdown: 'x', status: 'hidden', pinnedAt: null } },
      })
    }) as unknown as typeof fetch
    const client = createClient({ baseUrl: 'https://api.test', site: 'demo', fetchImpl })
    await expect(client.moderateComment({ commentId: 'c1', action: 'hide' })).resolves.toEqual({
      id: 'c1',
      status: 'hidden',
      pinnedAt: null,
    })
    expect(calls).toEqual([
      {
        method: 'POST',
        url: 'https://api.test/api/moderation',
        body: { site: 'demo', target: 'comment', commentId: 'c1', action: 'hide' },
      },
    ])
  })

  test('setPageLocked and setUserBlocked post their targets', async () => {
    const bodies: unknown[] = []
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { target: string }
      bodies.push(body)
      if (body.target === 'page')
        return Response.json({ data: { page: { id: 'p1', canonicalUrl: 'https://x.test/p', isLocked: true } } })
      return Response.json({ data: { userId: 'u1', blocked: true } })
    }) as unknown as typeof fetch
    const client = createClient({ baseUrl: 'https://api.test', site: 'demo', fetchImpl })
    await expect(client.setPageLocked({ pageId: 'p1', locked: true })).resolves.toEqual({
      id: 'p1',
      canonicalUrl: 'https://x.test/p',
      isLocked: true,
    })
    await expect(client.setUserBlocked({ userId: 'u1', blocked: true })).resolves.toEqual({
      userId: 'u1',
      blocked: true,
    })
    expect(bodies).toEqual([
      { site: 'demo', target: 'page', pageId: 'p1', locked: true },
      { site: 'demo', target: 'user', userId: 'u1', blocked: true },
    ])
  })

  test('createModerationComment posts the comment-create target and returns the row', async () => {
    const calls: { method?: string; url: string; body: Record<string, unknown> }[] = []
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ method: init?.method, url: String(url), body: JSON.parse(String(init?.body)) })
      return Response.json({
        data: {
          comment: {
            id: 'c9',
            parentId: null,
            authorName: 'Moderator',
            bodyMarkdown: 'posted from the dashboard',
            status: 'visible',
            pinnedAt: null,
            createdAt: '2026-10-18T00:00:00.000Z',
          },
        },
      })
    }) as unknown as typeof fetch
    const client = createClient({ baseUrl: 'https://api.test', site: 'demo', fetchImpl })
    await expect(
      client.createModerationComment({ pageId: 'p1', bodyMarkdown: 'posted from the dashboard' }),
    ).resolves.toMatchObject({ id: 'c9', authorName: 'Moderator', status: 'visible' })
    expect(calls).toEqual([
      {
        method: 'POST',
        url: 'https://api.test/api/moderation',
        body: { site: 'demo', target: 'comment-create', pageId: 'p1', bodyMarkdown: 'posted from the dashboard' },
      },
    ])
    await client.createModerationComment({ pageId: 'p1', bodyMarkdown: 'a reply', parentId: 'c1' })
    expect(calls.at(1)?.body).toEqual({
      site: 'demo',
      target: 'comment-create',
      pageId: 'p1',
      parentId: 'c1',
      bodyMarkdown: 'a reply',
    })
    // Anonymous dashboard posts carry the flag and the guest display name; the
    // server stores a guest row and returns its edit key.
    await client.createModerationComment({
      pageId: 'p1',
      bodyMarkdown: 'as a guest',
      anonymous: true,
      authorName: 'Dash guest',
    })
    expect(calls.at(2)?.body).toEqual({
      site: 'demo',
      target: 'comment-create',
      pageId: 'p1',
      anonymous: true,
      authorName: 'Dash guest',
      bodyMarkdown: 'as a guest',
    })
    await client.createModerationComment({ pageId: 'p1', bodyMarkdown: 'as myself' })
    expect(calls.at(3)?.body).not.toHaveProperty('anonymous')
    expect(calls.at(3)?.body).not.toHaveProperty('authorName')
  })

  test('editModerationComment posts the comment-edit target and returns the row', async () => {
    const calls: { method?: string; url: string; body: Record<string, unknown> }[] = []
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ method: init?.method, url: String(url), body: JSON.parse(String(init?.body)) })
      return Response.json({ data: { comment: { id: 'c9', bodyMarkdown: 'fixed the typo', status: 'visible' } } })
    }) as unknown as typeof fetch
    const client = createClient({ baseUrl: 'https://api.test', site: 'demo', fetchImpl })
    await expect(
      client.editModerationComment({ commentId: 'c9', bodyMarkdown: 'fixed the typo' }),
    ).resolves.toMatchObject({ id: 'c9', bodyMarkdown: 'fixed the typo' })
    expect(calls).toEqual([
      {
        method: 'POST',
        url: 'https://api.test/api/moderation',
        body: { site: 'demo', target: 'comment-edit', commentId: 'c9', bodyMarkdown: 'fixed the typo' },
      },
    ])
  })

  test('setModerationVote posts cast and clear votes through the moderation endpoint', async () => {
    const calls: { body: Record<string, unknown> }[] = []
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push({ body: JSON.parse(String(init?.body)) })
      return Response.json({ data: { vote: { score: 2, viewerVote: 1 } } })
    }) as unknown as typeof fetch
    const client = createClient({ baseUrl: 'https://api.test', site: 'demo', fetchImpl })
    await expect(client.setModerationVote({ commentId: 'c1', value: 1 })).resolves.toEqual({
      score: 2,
      viewerVote: 1,
    })
    await client.setModerationVote({ commentId: 'c1', value: null })
    expect(calls).toEqual([
      { body: { site: 'demo', target: 'vote', commentId: 'c1', value: 1 } },
      { body: { site: 'demo', target: 'vote', commentId: 'c1', value: null } },
    ])
  })

  test('FORBIDDEN surfaces as an ApiError code', async () => {
    const fetchImpl = (async () =>
      Response.json(
        { error: { code: 'FORBIDDEN', message: 'Moderation is restricted to administrators' } },
        { status: 403 },
      )) as unknown as typeof fetch
    const client = createClient({ baseUrl: 'https://api.test', site: 'demo', fetchImpl })
    const err = await client.moderateComment({ commentId: 'c1', action: 'hide' }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('FORBIDDEN')
    expect((err as ApiError).status).toBe(403)
  })
})

describe('canModerate', () => {
  test('accepts admin and moderator, rejects absent role', () => {
    expect(canModerate('admin')).toBe(true)
    expect(canModerate('moderator')).toBe(true)
    expect(canModerate(undefined)).toBe(false)
    expect(canModerate(null)).toBe(false)
  })
})

describe('moderationCommentToComment', () => {
  test('maps moderation rows to neutral render values and keeps status/userBlocked', () => {
    const row: ModerationComment = {
      id: 'c1',
      pageId: 'p1',
      parentId: null,
      userId: 'u1',
      authorName: 'Ada',
      bodyMarkdown: 'hi',
      status: 'hidden',
      pinnedAt: '2026-10-18T00:00:00.000Z',
      createdAt: '2026-10-17T00:00:00.000Z',
      pageUrl: 'https://x.test/p',
      pageLocked: true,
      userBlocked: true,
      score: 3,
      viewerVote: -1,
      authorRole: 'admin',
    }
    expect(moderationCommentToComment(row)).toEqual({
      id: 'c1',
      pageId: 'p1',
      parentId: null,
      userId: 'u1',
      authorName: 'Ada',
      avatarUrl: null,
      bodyMarkdown: 'hi',
      status: 'hidden',
      pinnedAt: '2026-10-18T00:00:00.000Z',
      createdAt: '2026-10-17T00:00:00.000Z',
      editedAt: null,
      score: 3,
      viewerVote: -1,
      authorRole: 'admin',
      userBlocked: true,
    })
  })
})
