import { describe, expect, test } from 'bun:test'
import { buildCommentTree, type Comment, renderMarkdown } from '@last-comments-widgets/client'
import {
  actionsMenuMarkup,
  applyVotes,
  canEditComment,
  errorMarkup,
  escapeHtml,
  guidePath,
  ITEM_INITIAL,
  insertPrefix,
  insertWrap,
  isSafeSvg,
  observeInView,
  pagerMarkup,
  parseThemeAttrs,
  pickActive,
  renderCommentNode,
  renderCommentTree,
  resolveTurnstileConfig,
  signInPromptMarkup,
  sortToggleMarkup,
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
    expect(next.items).toEqual({})
    expect(UI_INITIAL.replyTo).toBeNull()
    expect(transition(next, { type: 'moderation/pending', id: 'c1', value: true }).pendingModeration).toEqual({
      c1: true,
    })
    expect(transition(next, { type: 'moderation/pending', id: 'c2', value: false }).pendingModeration).toEqual({
      c2: false,
    })
  })

  test('a failed save keeps the editor open and stores the error', () => {
    const error = { code: 'VALIDATION_ERROR', title: 'Nope', message: 'Too long', action: 'none' as const }
    const open = transition(UI_INITIAL, { type: 'edit/open', id: 'c1' })
    expect(open.items.c1?.editing).toBe(true)
    const failed = transition(open, { type: 'edit/settle', id: 'c1', error })
    expect(failed.items.c1).toMatchObject({ editing: true, editError: error })
  })

  test('a successful save closes the editor and clears the error', () => {
    const error = { code: null, title: 'Nope', message: 'm', action: 'none' as const }
    const open = transition(UI_INITIAL, { type: 'edit/open', id: 'c1' })
    const failed = transition(open, { type: 'edit/settle', id: 'c1', error })
    const saved = transition(failed, { type: 'edit/settle', id: 'c1', error: null })
    expect(saved.items.c1).toMatchObject({ editing: false, editError: null })
    // Cancel clears both without needing a settle.
    expect(transition(failed, { type: 'edit/close', id: 'c1' }).items.c1).toMatchObject({
      editing: false,
      editError: null,
    })
  })

  test('pending flags round-trip independently', () => {
    const saving = transition(UI_INITIAL, { type: 'saving/set', id: 'c1', saving: true })
    expect(saving.items.c1?.saving).toBe(true)
    const replying = transition(saving, { type: 'reply/submit', id: 'c1' })
    expect(replying.items.c1).toMatchObject({ saving: true, replying: true })
    expect(transition(replying, { type: 'replying/set', id: 'c1', replying: false }).items.c1?.replying).toBe(false)
    expect(
      transition(replying, {
        type: 'reply/settle',
        id: 'c1',
        error: { code: null, title: 't', message: 'm', action: 'none' },
      }).items.c1?.replyError?.title,
    ).toBe('t')
  })

  test('the head composer posts under its own flag', () => {
    const posting = transition(UI_INITIAL, { type: 'posting/set', value: true })
    expect(posting.posting).toBe(true)
    expect(posting.items).toEqual({})
    expect(transition(posting, { type: 'posting/set', value: false }).posting).toBe(false)
    expect(UI_INITIAL.posting).toBe(false)
  })

  test('collapse/toggle stores the override and never touches the seed state', () => {
    expect(transition(UI_INITIAL, { type: 'collapse/toggle', id: 'c1', value: true }).items.c1?.collapsedOverride).toBe(
      true,
    )
    const collapsed = transition(UI_INITIAL, { type: 'collapse/toggle', id: 'c1', value: true })
    expect(transition(collapsed, { type: 'collapse/toggle', id: 'c1', value: false }).items.c1?.collapsedOverride).toBe(
      false,
    )
    expect(ITEM_INITIAL.collapsedOverride).toBeNull()
  })

  test('sort/set resets the page', () => {
    const paged = transition(UI_INITIAL, { type: 'page/set', value: 4 })
    expect(paged.page).toBe(4)
    const sorted = transition(paged, { type: 'sort/set', value: 'best' })
    expect(sorted).toMatchObject({ sort: 'best', page: 1 })
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
    expect(html).toContain('lc-reply')
    expect(html).toContain('data-comment-depth="1"')
    // Replies live in the measured disclosure panel the guides clip against.
    expect(html).toContain('data-lc-replies=')
    expect(html).toContain('data-slot="accordion-content"')
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
    // The edit entry lives in the lazily-built popover panel, so the entry set
    // is what the test reads, not the row's static markup.
    const ownPanel = actionsMenuMarkup(tree[0]?.comment as Comment, {
      canEdit: true,
      editing: false,
      canDelete: true,
      pending: false,
    })
    expect(ownPanel).toContain('data-action="menu-edit" data-comment-id="own"')
    const otherPanel = actionsMenuMarkup(tree[1]?.comment as Comment, {
      canEdit: false,
      editing: false,
      canDelete: false,
      pending: false,
    })
    expect(otherPanel).not.toContain('data-action="menu-edit"')
    const guestPanel = actionsMenuMarkup(tree[0]?.comment as Comment, {
      canEdit: false,
      editing: false,
      canDelete: false,
      pending: false,
    })
    expect(guestPanel).not.toContain('data-action="menu-edit"')
    const pinned = buildCommentTree([comment('p', null, 'hi', { pinnedAt: new Date().toISOString() })])
    expect(renderCommentTree(pinned)).toContain('pinned')
    const edited = buildCommentTree([comment('e', null, 'hi', { editedAt: new Date().toISOString() })])
    expect(renderCommentTree(edited)).toContain('edited')
    expect(
      renderCommentNode(tree[0], 0, {
        viewerUserId: 'u1',
        items: { own: { ...ITEM_INITIAL, editing: true } },
      }),
    ).toContain('data-lc-form="edit-own"')
  })

  test('the edit gate is owner-anytime, guest-key-window, else closed', () => {
    const now = new Date().toISOString()
    // Signed-in owners have no window.
    expect(canEditComment({ userId: 'u1', createdAt: now }, 'u1')).toBe(true)
    expect(canEditComment({ userId: 'u1', createdAt: '2000-01-01T00:00:00.000Z' }, 'u1')).toBe(true)
    // Someone else's comment (or a signed-out viewer) is closed.
    expect(canEditComment({ userId: 'u1', createdAt: now }, 'u2')).toBe(false)
    expect(canEditComment({ userId: 'u1', createdAt: now }, undefined)).toBe(false)
    // Guest comments need this browser's key, then the anonymous window.
    expect(canEditComment({ userId: null, createdAt: now }, undefined, { hasEditKey: true })).toBe(true)
    expect(canEditComment({ userId: null, createdAt: now }, undefined, { hasEditKey: false })).toBe(false)
    const old = new Date(Date.now() - 11 * 60_000).toISOString()
    expect(canEditComment({ userId: null, createdAt: old }, undefined, { hasEditKey: true })).toBe(false)
    // A longer window (0 = unlimited) is the host's choice.
    expect(
      canEditComment({ userId: null, createdAt: old }, undefined, { hasEditKey: true, anonWindowMinutes: 0 }),
    ).toBe(true)
    // A guest never inherits ownership just because the viewer is signed in.
    expect(canEditComment({ userId: null, createdAt: now }, 'u1', { hasEditKey: true, anonWindowMinutes: 10 })).toBe(
      true,
    )
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

  test('the reply guide hides through an attribute, and a bad value is dropped', () => {
    expect(
      parseThemeAttrs([
        ['data-lc-theme-var-thread-guide-display', 'none'],
        ['data-lc-theme-var-thread-indent', '0px'],
      ]),
    ).toEqual({ vars: { threadGuideDisplay: 'none', threadIndent: '0px' }, dark: {} })
    // Host attributes are untrusted: a value outside the closed set is dropped
    // so the documented default applies.
    expect(parseThemeAttrs([['data-lc-theme-var-thread-guide-display', 'hiden']])).toBeUndefined()
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
    const html = renderCommentTree(tree, { viewerUserId: 'u1', anonWindowMinutes: 5, readOnly: true })
    expect(html).toContain('>7</span>')
    expect(html).not.toContain('data-action="reply"')
    expect(html).not.toContain('data-action="edit"')
    expect(html).not.toContain('data-action="delete"')
    expect(html).not.toContain('data-action="vote"')
  })

  test('guest flag gates the name input, the turnstile box shows for everyone', () => {
    const tree = buildCommentTree([comment('p', null, 'hi')])
    const guestHtml = renderCommentNode(tree[0], 0, { replyTo: 'p', turnstileSiteKey: 'SITEKEY' })
    expect(guestHtml).toContain('name="authorName"')
    expect(guestHtml).toContain('lc-turnstile')
    const signedIn = renderCommentNode(tree[0], 0, { replyTo: 'p', guest: false, turnstileSiteKey: 'SITEKEY' })
    expect(signedIn).not.toContain('name="authorName"')
    expect(signedIn).toContain('lc-turnstile')
  })

  test('moderator rows render status-appropriate actions and votes', () => {
    const visible = buildCommentTree([comment('v', null, 'hi', { userId: 'u1', score: 2, viewerVote: 1 })])
    const admin = renderCommentTree(visible, { viewerUserId: 'u1', viewerRole: 'admin' })
    // The moderation entries live in the lazily-built popover panel.
    const adminPanel = actionsMenuMarkup(visible[0]?.comment as Comment, {
      canEdit: true,
      editing: false,
      canDelete: true,
      viewerRole: 'admin',
      pending: false,
    })
    expect(adminPanel).toContain('data-moderation-action="hide"')
    expect(adminPanel).toContain('data-moderation-action="pin"')
    expect(adminPanel).toContain('data-moderation-action="delete"')
    expect(adminPanel).toContain('data-action="block-user"')
    // The moderation payload carries vote state, so moderators vote in place.
    expect(admin).toContain('data-action="vote"')
    expect(admin).toContain('aria-pressed="true"')
    expect(admin).toContain('>2</span>')
    expect(adminPanel).not.toContain('data-action="delete" data-comment-id="v"')

    // Hidden, deleted and locked-page rows never offer a vote: the endpoint
    // rejects those clicks.
    const hidden = buildCommentTree([comment('h', null, 'hi', { status: 'hidden' })])
    const hiddenHtml = renderCommentTree(hidden, { viewerRole: 'admin' })
    const hiddenPanel = actionsMenuMarkup(hidden[0]?.comment as Comment, {
      canEdit: false,
      editing: false,
      canDelete: false,
      viewerRole: 'admin',
      pending: false,
    })
    expect(hiddenPanel).toContain('data-moderation-action="restore"')
    expect(hiddenPanel).not.toContain('data-moderation-action="hide"')
    expect(hiddenHtml).toContain('>hidden</span>')
    expect(hiddenHtml).not.toContain('data-action="vote"')

    const deleted = buildCommentTree([comment('d', null, 'hi', { status: 'deleted' })])
    const deletedHtml = renderCommentTree(deleted, { viewerRole: 'admin' })
    const deletedPanel = actionsMenuMarkup(deleted[0]?.comment as Comment, {
      canEdit: false,
      editing: false,
      canDelete: false,
      viewerRole: 'admin',
      pending: false,
    })
    expect(deletedPanel).toContain('data-moderation-action="restore"')
    expect(deletedPanel).not.toContain('data-moderation-action="delete"')
    expect(deletedHtml).toContain('>deleted</span>')
    expect(deletedHtml).not.toContain('data-action="reply"')
    expect(deletedHtml).not.toContain('data-action="vote"')

    const locked = renderCommentTree(visible, { viewerRole: 'admin', hideVotes: true })
    expect(locked).not.toContain('data-action="vote"')
  })

  test('pending moderation disables the row buttons', () => {
    const tree = buildCommentTree([comment('p', null, 'hi')])
    const panel = actionsMenuMarkup(tree[0]?.comment as Comment, {
      canEdit: false,
      editing: false,
      canDelete: false,
      viewerRole: 'admin',
      pending: true,
    })
    expect(panel).toContain('data-comment-id="p" disabled')
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

  test('signInPromptMarkup is the neutral card, not an error, and links or starts sign-in by context', () => {
    const info = {
      code: 'UNAUTHENTICATED',
      title: 'Please sign in',
      message: 'Sign in to vote.',
      action: 'sign-in',
    } as const
    const inPlace = signInPromptMarkup(info, 'vote')
    expect(inPlace).toContain('class="lc-signin"')
    expect(inPlace).toContain('data-signin-context="vote"')
    expect(inPlace).toContain('role="status"')
    expect(inPlace).not.toContain('role="alert"')
    expect(inPlace).toContain('data-action="error-sign-in"')
    const linked = signInPromptMarkup(info, 'read', { signInUrl: 'https://host.test/sign-in' })
    expect(linked).toContain('href="https://host.test/sign-in"')
    expect(linked).not.toContain('data-action="error-sign-in"')
    expect(signInPromptMarkup(info, 'write', { signInUrl: 'javascript:alert(1)' })).not.toContain('javascript:')
  })
})

describe('guidePath', () => {
  test('a head without replies draws nothing and starts the next thread', () => {
    // A bare head row: nothing to connect, so the path stays empty.
    expect(guidePath([{ depth: 0, left: 16, top: 0, bottom: 40, paddingLeft: 0, hasReplies: false }]).d).toBe('')
    // The same head with a reply group: it draws its own rail inside its card
    // padding, then bends to the reply's rail.
    const { d } = guidePath([
      { depth: 0, left: 16, top: 0, bottom: 40, paddingLeft: 12, hasReplies: true },
      { depth: 1, left: 32, top: 60, bottom: 100, paddingLeft: 16, hasReplies: false },
    ])
    expect(d.startsWith('M 22.5 0')).toBe(true)
    expect(d).toContain('L 22.5 40')
    expect(d).toContain('C')
    expect(d.endsWith('L 40.5 100')).toBe(true)
  })

  test('a new thread head breaks the path instead of joining the previous one', () => {
    const { d } = guidePath([
      { depth: 0, left: 16, top: 0, bottom: 40, paddingLeft: 12, hasReplies: true },
      { depth: 1, left: 32, top: 60, bottom: 100, paddingLeft: 16, hasReplies: false },
      { depth: 0, left: 16, top: 140, bottom: 180, paddingLeft: 12, hasReplies: true },
    ])
    // Two subpaths, and the second starts fresh instead of curving up from the first.
    const [first, second] = d.split('M ').filter(Boolean)
    expect(second).toBe('22.5 140 L 22.5 180')
    expect(first).toContain('C')
  })

  test('a folded group keeps a stub beside its trigger, one gutter lower', () => {
    const { d } = guidePath([
      {
        depth: 0,
        left: 16,
        top: 0,
        bottom: 40,
        paddingLeft: 12,
        hasReplies: true,
        stub: { top: 40, bottom: 80 },
      },
    ])
    // Stub top = 40 + 2 * 8; x = left + paddingLeft + one reply indent (16) +
    // half of the folded reply's own padding (8).
    expect(d.endsWith('C 22.5 52 52.5 44 52.5 56 L 52.5 80')).toBe(true)
  })

  test('empty pages and zero-height bands produce no path', () => {
    expect(guidePath([])).toEqual({ d: '', width: 0, height: 0 })
    expect(guidePath([{ depth: 1, left: 32, top: 20, bottom: 20, paddingLeft: 16, hasReplies: false }]).d).toBe('')
  })
})

describe('pickActive', () => {
  const spans: [string, [number, number]][] = [
    ['a', [0, 40]],
    ['b', [60, 100]],
    ['c', [120, 160]],
  ]

  test('the nearest comment above the reading band is current', () => {
    expect(pickActive(spans, 10)).toBe('a')
    expect(pickActive(spans, 70)).toBe('b')
    expect(pickActive(spans, 500)).toBe('c')
  })

  test('nothing has reached the band yet: the first row reads as current', () => {
    expect(pickActive(spans, -100)).toBe('a')
    expect(pickActive([], 100)).toBeNull()
  })
})

describe('sortToggleMarkup', () => {
  test('renders the toolbar with pressed states and variants', () => {
    const html = sortToggleMarkup('best')
    expect(html).toContain('role="toolbar"')
    expect(html).toContain('aria-label="Sort comments"')
    expect(html).toContain('>Sort</span>')
    for (const label of ['Newest', 'Oldest', 'Best']) expect(html).toContain(`>${label}</button>`)
    expect(html).toContain('data-sort="best" aria-pressed="true" class="')
    expect(html).toContain('data-sort="newest" aria-pressed="false" class="')
    // Active reads as secondary, inactive as ghost.
    expect(html).toContain('bg-secondary text-secondary-foreground')
    expect(html).toContain('hover:bg-muted')
  })
})

describe('row contract', () => {
  test('the composer counts the raw body against the configured limit', () => {
    const tree = buildCommentTree([comment('p', null, 'hi')])
    const html = renderCommentNode(tree[0], 0, { replyTo: 'p', bodyLimit: 25 })
    expect(html).toContain('data-lc-char-count')
    expect(html).toContain('aria-describedby="lc-count-reply-p"')
    expect(html).toContain('id="lc-count-reply-p"')
    expect(html).toContain('tabular-nums')
    expect(html).toContain('data-lc-char-used>0</span> / 25')
    expect(html).not.toContain('maxlength="10000"')
    // The reply header carries the cancel affordance.
    expect(html).toContain('Replying to this comment')
  })

  test('actionMode drives the reply button icon and label', () => {
    const tree = buildCommentTree([comment('p', null, 'hi')])
    const iconOnly = renderCommentNode(tree[0], 0, { actionMode: 'icon' })
    expect(iconOnly).toContain('aria-label="Reply"')
    expect(iconOnly).toContain('<span class="sr-only">Reply</span>')
    const textOnly = renderCommentNode(tree[0], 0, { actionMode: 'text' })
    expect(textOnly).not.toContain('data-action="reply" data-comment-id="p" aria-expanded="false" aria-label')
    expect(textOnly).toContain('<span class="">Reply</span>')
    const both = renderCommentNode(tree[0], 0, {})
    expect(both).toContain('data-action="reply"')
    expect(both).toContain('<span class="">Reply</span>')
  })

  test('a signed-out Reply stays visible and opens the sign-in prompt where the form would be', () => {
    const tree = buildCommentTree([comment('p', null, 'hi')])
    const signInUrl = 'https://host.test/sign-in'
    const idle = renderCommentNode(tree[0], 0, { writeAllowed: false, signInUrl })
    expect(idle).toContain('data-action="reply"')
    expect(idle).not.toContain('data-lc-signin')
    const opened = renderCommentNode(tree[0], 0, { writeAllowed: false, replyTo: 'p', signInUrl })
    expect(opened).toContain('data-signin-context="reply"')
    expect(opened).toContain('Sign in to reply to this comment.')
    expect(opened).toContain(`href="${signInUrl}"`)
    expect(opened).not.toContain('data-lc-form')
    // Signed in: the same open reply renders the form, not the prompt.
    const signedIn = renderCommentNode(tree[0], 0, { replyTo: 'p' })
    expect(signedIn).toContain('data-lc-form')
    expect(signedIn).not.toContain('data-signin-context')
  })

  test('a negative score folds the row into a summary', () => {
    const tree = buildCommentTree([comment('p', null, 'hi there   friend', { score: -2 })])
    const html = renderCommentTree(tree)
    expect(html).toContain('data-lc-collapsed=')
    expect(html).toContain('comment hidden')
    expect(html).toContain('hi there friend')
    expect(html).toContain('aria-expanded="false"')
    // An explicit override re-opens it.
    const expanded = renderCommentTree(tree, {
      items: { p: { ...ITEM_INITIAL, collapsedOverride: false } },
    })
    expect(expanded).not.toContain('data-lc-collapsed=')
    expect(expanded).toContain('lc-markdown')
  })

  test('a folded thread with replies shows the stack, count and status breakdown', () => {
    const tree = buildCommentTree([
      comment('p', null, 'parent', { score: -1 }),
      comment('r1', 'p', 'a', { userId: 'u2' }),
      comment('r2', 'r1', 'b', { userId: 'u3', pinnedAt: new Date().toISOString() }),
      comment('r3', 'p', 'c', { status: 'hidden' }),
    ])
    const html = renderCommentTree(tree, { viewerRole: 'admin' })
    expect(html).toContain('lc-reply-stack')
    expect(html).toContain('3 replies')
    expect(html).toContain('1 pinned · 1 hidden')
  })

  test('the actions menu carries the React entry set and copy', () => {
    const own = buildCommentTree([comment('p', null, 'hi', { userId: 'u1' })])
    const html = renderCommentTree(own, { viewerUserId: 'u1' })
    // React renders the panel as a dialog popover that mounts only while it is
    // open, so the row keeps the trigger alone and the panel is built on demand.
    expect(html).toContain('aria-haspopup="dialog" aria-expanded="false" aria-label="More actions"')
    expect(html).toContain('data-action="menu-toggle"')
    expect(html).not.toContain('lc-actions-menu')
    const panel = actionsMenuMarkup(own[0]?.comment as Comment, {
      canEdit: true,
      editing: false,
      canDelete: true,
      pending: false,
    })
    expect(panel).toContain('>Edit</button>')
    expect(panel).toContain('>Delete</button>')
    expect(panel).toContain('lc-action-destructive')
    // The panel is a popover, so its entries carry no menu role.
    expect(panel).not.toContain('role="menuitem"')
    const anonymous = renderCommentTree(buildCommentTree([comment('q', null, 'hi')]))
    expect(anonymous).not.toContain('data-action="menu-toggle"')
  })
})

describe('resolveTurnstileConfig', () => {
  test('follows the widget light/dark mode unless the host overrides the theme', () => {
    expect(resolveTurnstileConfig(true)).toEqual({ theme: 'dark', appearance: 'interaction-only' })
    expect(resolveTurnstileConfig(false)).toEqual({ theme: 'light', appearance: 'interaction-only' })
    expect(resolveTurnstileConfig(true, { theme: 'light' })).toEqual({ theme: 'light', appearance: 'interaction-only' })
    expect(resolveTurnstileConfig(false, { theme: 'auto' })).toEqual({ theme: 'auto', appearance: 'interaction-only' })
  })

  test('shows the challenge only when needed by default, and a host can opt into the always-visible box', () => {
    expect(resolveTurnstileConfig(false).appearance).toBe('interaction-only')
    expect(resolveTurnstileConfig(false, { appearance: 'always' }).appearance).toBe('always')
  })

  test('forwards the Cloudflare design knobs and omits unset ones', () => {
    expect(resolveTurnstileConfig(false, { size: 'compact', appearance: 'interaction-only', language: 'de' })).toEqual({
      theme: 'light',
      size: 'compact',
      appearance: 'interaction-only',
      language: 'de',
    })
    expect(resolveTurnstileConfig(true, { size: 'flexible' })).toEqual({
      theme: 'dark',
      appearance: 'interaction-only',
      size: 'flexible',
    })
  })
})

describe('isSafeSvg', () => {
  test('accepts the markup mermaid emits for a diagram', () => {
    const svg =
      '<svg id="lc-vanilla-mermaid-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g class="node"><text>A</text></g></svg>'
    expect(isSafeSvg(svg)).toBe(true)
  })

  test('rejects script elements', () => {
    expect(isSafeSvg('<svg><script>alert(1)</script></svg>')).toBe(false)
    expect(isSafeSvg('<svg>\n<script\nsrc="x"></script></svg>')).toBe(false)
  })

  test('rejects inline event handlers', () => {
    expect(isSafeSvg('<svg><g onclick="alert(1)"></g></svg>')).toBe(false)
    expect(isSafeSvg('<svg onload = "alert(1)"></svg>')).toBe(false)
  })

  test('rejects javascript urls', () => {
    expect(isSafeSvg('<svg><a href="JavaScript:alert(1)"></a></svg>')).toBe(false)
  })
})

describe('math placeholders', () => {
  test('rows render the math variant only when the flag is on', () => {
    const tree = buildCommentTree([comment('p', null, 'a $x$ b')])
    expect(renderCommentNode(tree[0], 0, { math: true })).toContain('data-tex="x"')
    expect(renderCommentNode(tree[0], 0, {})).toContain('a $x$ b')
  })
})

describe('deleted comments', () => {
  test('a deleted comment reads as the placeholder and keeps its replies nested under it', () => {
    const tree = buildCommentTree([
      comment('p', null, '', { status: 'deleted', authorName: '', userId: null, avatarUrl: null }),
      comment('r', 'p', 'still here', { authorName: 'Ben' }),
    ])
    const html = renderCommentTree(tree, {})
    expect(html).toContain('[This comment was deleted]')
    expect(html).toContain('data-lc-placeholder="deleted"')
    expect(html.indexOf('still here')).toBeGreaterThan(html.indexOf('[This comment was deleted]'))
  })

  test('a guest who holds the edit key is offered Delete, and a guest without it is not', () => {
    const row = comment('c', null, 'mine', { userId: null })
    const entry = { canEdit: false, editing: false, viewerRole: undefined, pending: false }
    expect(actionsMenuMarkup(row, { ...entry, canDelete: true })).toContain('data-action="delete"')
    expect(actionsMenuMarkup(row, { ...entry, canDelete: false })).not.toContain('data-action="delete"')
  })
})
