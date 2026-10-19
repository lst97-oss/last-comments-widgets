import { describe, expect, test } from 'bun:test'
import { buildCommentTree, type Comment, renderMarkdown } from '@last-comments-widgets/client'
import {
  applyVotes,
  errorMarkup,
  escapeHtml,
  insertPrefix,
  insertWrap,
  observeInView,
  pagerMarkup,
  parseThemeAttrs,
  renderCommentNode,
  renderCommentTree,
  transition,
  UI_INITIAL,
} from './index'

function comment(id: string, parentId: string | null, bodyMarkdown: string, extra?: Partial<Comment>): Comment {
  return {
    id,
    pageId: 'page-1',
    parentId,
    userId: null,
    authorName: 'Ada',
    bodyMarkdown,
    status: 'visible',
    pinnedAt: null,
    createdAt: new Date().toISOString(),
    editedAt: null,
    score: 0,
    viewerVote: null,
    authorRole: null,
    ...extra,
  }
}

describe('observeInView', () => {
  const node = {} as Element
  function fakeObserver() {
    const state = {
      constructed: 0,
      observed: [] as Element[],
      disconnected: 0,
      callback: undefined as ((entries: { isIntersecting: boolean }[]) => void) | undefined,
    }
    class FakeObserver {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        state.constructed += 1
        state.callback = callback
      }
      observe(value: Element) {
        state.observed.push(value)
      }
      disconnect() {
        state.disconnected += 1
        state.callback = undefined
      }
    }
    return { state, ctor: FakeObserver as unknown as typeof IntersectionObserver }
  }

  test('resolves immediately without lazy or an observer', () => {
    const { state, ctor } = fakeObserver()
    let entered = 0
    expect(
      observeInView(node, false, ctor, () => {
        entered += 1
      }),
    ).toBeUndefined()
    observeInView(node, true, undefined, () => {
      entered += 1
    })
    expect(entered).toBe(2)
    expect(state.constructed).toBe(0)
  })

  test('enters once when intersecting, then disconnects', () => {
    const { state, ctor } = fakeObserver()
    let entered = 0
    observeInView(node, true, ctor, () => {
      entered += 1
    })
    expect(state.observed).toEqual([node])
    state.callback?.([{ isIntersecting: false }])
    state.callback?.([{ isIntersecting: true }])
    state.callback?.([{ isIntersecting: true }])
    expect(entered).toBe(1)
    expect(state.disconnected).toBe(1)
  })
})

describe('pagerMarkup', () => {
  test('shows a page label and disables edges', () => {
    expect(pagerMarkup(1, 20, 5, false, false)).toBe('')
    const pager = pagerMarkup(1, 20, 25, true, false)
    expect(pager).toContain('Page <span aria-current="page"')
    expect(pager).toContain('>1</span>')
    expect(pager).toContain('data-action="page-prev" disabled')
    expect(pager).not.toContain('data-action="page-next" disabled')
    expect(pagerMarkup(2, 20, 25, false, true)).toContain('data-action="page-next" disabled')
  })
})

describe('transition', () => {
  test('one flag moves without touching the others', () => {
    const next = transition(UI_INITIAL, { type: 'reply', value: 'c1' })
    expect(next.replyTo).toBe('c1')
    expect(next.editingId).toBeNull()
    expect(UI_INITIAL.replyTo).toBeNull()
    expect(transition(next, { type: 'moderation/pending', id: 'c1', value: true }).pendingModeration).toEqual({
      c1: true,
    })
    expect(transition(next, { type: 'moderation/pending', id: 'c2', value: false }).pendingModeration).toEqual({
      c2: false,
    })
  })

  test('the latest error wins and a null clears only the action error', () => {
    const first = transition(UI_INITIAL, {
      type: 'error',
      value: { code: null, title: 'A', message: 'a', action: 'none' },
    })
    const second = transition(first, { type: 'error', value: { code: null, title: 'B', message: 'b', action: 'none' } })
    expect(second.actionError?.title).toBe('B')
    expect(transition(second, { type: 'error', value: null }).actionError).toBeNull()
  })

  test('unknown actions throw', () => {
    expect(() => transition(UI_INITIAL, { type: 'nope' } as never)).toThrow('Unknown UI action')
  })
})

describe('applyVotes', () => {
  const rows = [comment('a', null, 'A'), comment('b', null, 'B')]

  test('patches only the voted row and keeps untouched rows by identity', () => {
    const next = applyVotes(rows, { a: { score: 2, viewerVote: 1 } })
    expect(next).not.toBe(rows)
    expect(next[0]).not.toBe(rows[0])
    expect(next[0].score).toBe(2)
    expect(next[0].viewerVote).toBe(1)
    expect(next[1]).toBe(rows[1])
  })

  test('empty overlay returns the input array', () => {
    expect(applyVotes(rows, {})).toBe(rows)
  })

  test('unknown ids are ignored', () => {
    expect(applyVotes(rows, { missing: { score: 9, viewerVote: -1 } })).toBe(rows)
  })
})

describe('vanilla renderer', () => {
  test('nests replies under parents', () => {
    const tree = buildCommentTree([comment('p', null, 'parent'), comment('r', 'p', 'child')])
    const html = renderCommentTree(tree)
    expect(html).toContain('parent')
    expect(html.indexOf('child')).toBeGreaterThan(html.indexOf('parent'))
    expect(html).toContain('ml-6')
  })

  test('escapeHtml neutralizes attr injection', () => {
    expect(escapeHtml('<b>&"\'</b>')).toBe('&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;')
  })

  test('body renders markdown, strips raw html and javascript links', () => {
    const tree = buildCommentTree([comment('x', null, '**b** <script>alert(1)</script> [e](javascript:alert(1))')])
    const html = renderCommentTree(tree)
    expect(html).toContain('<strong>b</strong>')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('lc-markdown')
    expect(renderMarkdown('[ok](https://a.b)')).toContain('<a href="https://a.b"')
  })

  test('edit buttons render only for matching userId', () => {
    const tree = buildCommentTree([
      comment('own', null, 'mine', { userId: 'u1' }),
      comment('other', null, 'theirs', { userId: 'u2' }),
    ])
    const own = renderCommentTree(tree, { viewerUserId: 'u1' })
    expect(own).toContain('data-action="edit" data-comment-id="own"')
    expect(own).not.toContain('data-action="edit" data-comment-id="other"')
    const guest = renderCommentTree(tree)
    expect(guest).not.toContain('data-action="edit"')
    const pinned = buildCommentTree([comment('p', null, 'hi', { pinnedAt: new Date().toISOString() })])
    expect(renderCommentTree(pinned)).toContain('pinned')
    const edited = buildCommentTree([comment('e', null, 'hi', { editedAt: new Date().toISOString() })])
    expect(renderCommentTree(edited)).toContain('edited')
    expect(renderCommentNode(tree[0], 0, { viewerUserId: 'u1', editingId: 'own' })).toContain('data-lc-form="edit-own"')
  })

  test('edit hidden on expired window, shown when unlimited', () => {
    const old = new Date(Date.now() - 6 * 60_000).toISOString()
    const tree = buildCommentTree([comment('old', null, 'mine', { userId: 'u1', createdAt: old })])
    const expired = renderCommentNode(tree[0], 0, { viewerUserId: 'u1' })
    expect(expired).not.toContain('data-action="edit"')
    expect(expired).toContain('data-action="delete"')
    const unlimited = renderCommentNode(tree[0], 0, { viewerUserId: 'u1', editWindowMinutes: 0 })
    expect(unlimited).toContain('data-action="edit"')
  })

  test('parseThemeAttrs maps kebab attrs, drops unknown', () => {
    expect(
      parseThemeAttrs([
        ['data-lc-theme-var-primary', '#b91c1c'],
        ['data-lc-theme-var-primary-foreground', '#fff'],
        ['data-lc-theme-var-card-shadow', '0 8px 30px rgb(0 0 0 / 0.12)'],
        ['data-lc-theme-dark-var-primary', '#f87171'],
        ['data-lc-theme-var-nope', 'x'],
        ['data-lc-site', 'demo'],
      ]),
    ).toEqual({
      vars: { primary: '#b91c1c', primaryForeground: '#fff', cardShadow: '0 8px 30px rgb(0 0 0 / 0.12)' },
      dark: { primary: '#f87171' },
    })
  })

  test('HTML attributes expose the same popup and sizing tokens as framework props', () => {
    expect(
      parseThemeAttrs([
        ['data-lc-theme-var-popover', '#ffeedd'],
        ['data-lc-theme-var-accent-foreground', '#111'],
        ['data-lc-theme-var-font-family', 'Georgia, serif'],
        ['data-lc-theme-var-control-height', '44px'],
        ['data-lc-theme-var-dropdown-shadow', 'none'],
        ['data-lc-theme-dark-var-popover', '#221100'],
        ['data-lc-theme-var-constructor', 'ignored'],
        ['data-lc-theme-var-__proto__', 'ignored'],
      ]),
    ).toEqual({
      vars: {
        popover: '#ffeedd',
        accentForeground: '#111',
        fontFamily: 'Georgia, serif',
        controlHeight: '44px',
        dropdownShadow: 'none',
      },
      dark: { popover: '#221100' },
    })
  })

  test('panel composer has preview toggle and full toolbar', () => {
    const tree = buildCommentTree([comment('p', null, 'hi')])
    const html = renderCommentNode(tree[0], 0, { replyTo: 'p' })
    expect(html).toContain('lc-composer')
    expect(html).toContain('data-action="preview"')
    expect(html).toContain('Write a reply…')
    expect(html).toContain('Styling with')
    for (const a of ['md-bold', 'md-italic', 'md-quote', 'md-code', 'md-link', 'md-bullet', 'md-ordered'])
      expect(html).toContain(`data-action="${a}"`)
  })

  test('readOnly rows show score text and hide all actions', () => {
    const tree = buildCommentTree([comment('p', null, 'hi', { userId: 'u1', score: 7 })])
    const html = renderCommentTree(tree, { viewerUserId: 'u1', editWindowMinutes: 5, readOnly: true })
    expect(html).toContain('>7</span>')
    expect(html).not.toContain('data-action="reply"')
    expect(html).not.toContain('data-action="edit"')
    expect(html).not.toContain('data-action="delete"')
    expect(html).not.toContain('data-action="vote"')
  })

  test('guest flag gates the name input and turnstile box', () => {
    const tree = buildCommentTree([comment('p', null, 'hi')])
    const guestHtml = renderCommentNode(tree[0], 0, { replyTo: 'p', turnstileSiteKey: 'SITEKEY' })
    expect(guestHtml).toContain('name="authorName"')
    expect(guestHtml).toContain('lc-turnstile')
    const signedIn = renderCommentNode(tree[0], 0, { replyTo: 'p', guest: false, turnstileSiteKey: 'SITEKEY' })
    expect(signedIn).not.toContain('name="authorName"')
    expect(signedIn).not.toContain('lc-turnstile')
  })

  test('moderator rows render status-appropriate actions and votes', () => {
    const visible = buildCommentTree([comment('v', null, 'hi', { userId: 'u1', score: 2, viewerVote: 1 })])
    const admin = renderCommentTree(visible, { viewerUserId: 'u1', viewerRole: 'admin' })
    expect(admin).toContain('data-moderation-action="hide"')
    expect(admin).toContain('data-moderation-action="pin"')
    expect(admin).toContain('data-moderation-action="delete"')
    expect(admin).toContain('data-action="block-user"')
    // The moderation payload carries vote state, so moderators vote in place.
    expect(admin).toContain('data-action="vote"')
    expect(admin).toContain('aria-pressed="true"')
    expect(admin).toContain('>2</span>')
    expect(admin).not.toContain('data-action="delete" data-comment-id="v"')

    // Hidden, deleted and locked-page rows never offer a vote: the endpoint
    // rejects those clicks.
    const hidden = buildCommentTree([comment('h', null, 'hi', { status: 'hidden' })])
    const hiddenHtml = renderCommentTree(hidden, { viewerRole: 'moderator' })
    expect(hiddenHtml).toContain('data-moderation-action="restore"')
    expect(hiddenHtml).not.toContain('data-moderation-action="hide"')
    expect(hiddenHtml).toContain('>hidden</span>')
    expect(hiddenHtml).not.toContain('data-action="vote"')

    const deleted = buildCommentTree([comment('d', null, 'hi', { status: 'deleted' })])
    const deletedHtml = renderCommentTree(deleted, { viewerRole: 'moderator' })
    expect(deletedHtml).toContain('data-moderation-action="restore"')
    expect(deletedHtml).not.toContain('data-moderation-action="delete"')
    expect(deletedHtml).toContain('>deleted</span>')
    expect(deletedHtml).not.toContain('data-action="reply"')
    expect(deletedHtml).not.toContain('data-action="vote"')

    const locked = renderCommentTree(visible, { viewerRole: 'admin', hideVotes: true })
    expect(locked).not.toContain('data-action="vote"')
  })

  test('pending moderation disables the row buttons', () => {
    const tree = buildCommentTree([comment('p', null, 'hi')])
    const html = renderCommentTree(tree, { viewerRole: 'admin', pendingModeration: { p: true } })
    expect(html).toContain('data-comment-id="p" disabled')
  })

  test('quote and bullet prefixes insert on lines', () => {
    expect(insertPrefix('a\nb', 0, 3, '> ', 'quote')).toEqual({ value: '> a\n> b', start: 2, end: 7 })
    expect(insertPrefix('', 0, 0, '- ', 'item')).toEqual({ value: '- item', start: 2, end: 6 })
    expect(insertPrefix('', 0, 0, '1. ', 'item')).toEqual({ value: '1. item', start: 3, end: 7 })
    expect(insertWrap('hi', 0, 2, '**', '**', 'bold')).toEqual({ value: '**hi**', start: 2, end: 4 })
  })

  test('errorMarkup escapes copy and hooks the block', () => {
    const html = errorMarkup({
      code: 'VALIDATION_ERROR',
      title: "That didn't work",
      message: '<b>x</b> "quoted"',
      action: 'none',
    })
    expect(html).toContain('data-lc-error')
    expect(html).toContain('data-error-code="VALIDATION_ERROR"')
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt; &quot;quoted&quot;')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('<b>')
  })

  test('errorMarkup renders retry, sign-in and the empty code', () => {
    const retry = errorMarkup({ code: null, title: 't', message: 'm', action: 'retry' })
    expect(retry).toContain('data-action="error-retry"')
    expect(retry).toContain('>Try again</button>')
    expect(retry).toContain('data-error-code=""')
    expect(
      errorMarkup({ code: 'SIGN_OUT_FAILED', title: 't', message: 'm', action: 'retry' }, { retryAction: 'signout' }),
    ).toContain('data-action="signout"')
    expect(errorMarkup({ code: null, title: 't', message: 'm', action: 'sign-in' })).toContain(
      'data-action="error-sign-in"',
    )
    expect(
      errorMarkup(
        { code: 'UNAUTHENTICATED', title: 't', message: 'm', action: 'sign-in' },
        { signInUrl: 'https://host.test/sign-in' },
      ),
    ).toContain('href="https://host.test/sign-in"')
  })
})
