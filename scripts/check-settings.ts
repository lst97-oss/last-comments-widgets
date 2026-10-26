// Browser check of the site-settings gate and the vote and delete rules across all four ports. Each port mounts
// with no `settings` prop, so it reads the policy from the settings endpoint; Playwright serves that endpoint,
// the session, the list and the vote and delete calls, and records what each port asked for. Every mode runs
// twice: as the comments widget, and as the read-only viewer (`?viewer`), which gates on the same policy.
import { chromium, type Page } from 'playwright-core'

const frameworks = ['vanilla', 'react', 'vue', 'angular'] as const
type Framework = (typeof frameworks)[number]

// `-signed` modes carry a session; the access level is the mode's prefix. `novotes` is open with voting off.
const modes = ['open', 'login', 'login-signed', 'private', 'private-signed', 'nosettings', 'novotes'] as const
type Mode = (typeof modes)[number]

type Surface = 'widget' | 'viewer'

// `guestVote`: what clicking Upvote must do. 'sign-in' sends nothing and shows the notice; 'request' sends one.
// null where no vote button is shown. `prompts` counts the sign-in cards on screen before any click: a login site
// shows one (the composer's) and a private site exactly one (the list's), never both.
type Expected = {
  composer: boolean
  signIn: boolean
  prompts: number
  cards: number
  deleted: number
  votes: boolean
  reply: boolean
  limit: number | null
  lists: number
  anonymous: boolean | null
  guestVote: 'sign-in' | 'request' | null
  viewer: { cards: number; prompts: number; lists: number }
}

// What each mode must show. `limit` is the composer counter; `anonymous` is whether the identity menu offers
// Anonymous (null where no identity menu is reachable); `deleted` counts the redacted placeholder rows.
const expected: Record<Mode, Expected> = {
  open: {
    composer: true,
    signIn: false,
    prompts: 0,
    cards: 3,
    deleted: 1,
    votes: true,
    reply: true,
    limit: 500,
    lists: 1,
    anonymous: true,
    guestVote: 'sign-in',
    viewer: { cards: 3, prompts: 0, lists: 1 },
  },
  login: {
    composer: false,
    signIn: true,
    prompts: 1,
    cards: 3,
    deleted: 1,
    votes: true,
    reply: true,
    limit: null,
    lists: 1,
    anonymous: null,
    guestVote: 'sign-in',
    viewer: { cards: 3, prompts: 0, lists: 1 },
  },
  'login-signed': {
    composer: true,
    signIn: false,
    prompts: 0,
    cards: 3,
    deleted: 1,
    votes: true,
    reply: true,
    limit: 500,
    lists: 1,
    anonymous: false,
    guestVote: 'request',
    viewer: { cards: 3, prompts: 0, lists: 1 },
  },
  private: {
    composer: false,
    signIn: true,
    prompts: 1,
    cards: 0,
    deleted: 0,
    votes: false,
    reply: false,
    limit: null,
    lists: 0,
    anonymous: null,
    guestVote: null,
    viewer: { cards: 0, prompts: 1, lists: 0 },
  },
  'private-signed': {
    composer: true,
    signIn: false,
    prompts: 0,
    cards: 3,
    deleted: 1,
    votes: true,
    reply: true,
    limit: 500,
    lists: 1,
    anonymous: false,
    guestVote: 'request',
    viewer: { cards: 3, prompts: 0, lists: 1 },
  },
  // An unreadable settings document falls back to the built-in open policy and 10,000 characters.
  nosettings: {
    composer: true,
    signIn: false,
    prompts: 0,
    cards: 3,
    deleted: 1,
    votes: true,
    reply: true,
    limit: 10_000,
    lists: 1,
    anonymous: true,
    guestVote: 'sign-in',
    viewer: { cards: 3, prompts: 0, lists: 1 },
  },
  // Voting switched off for the site: no arrows at all, whoever is looking.
  novotes: {
    composer: true,
    signIn: false,
    prompts: 0,
    cards: 3,
    deleted: 1,
    votes: false,
    reply: true,
    limit: 500,
    lists: 1,
    anonymous: true,
    guestVote: null,
    viewer: { cards: 3, prompts: 0, lists: 1 },
  },
}

const DELETED_TEXT = '[This comment was deleted]'
const EDIT_KEY = 'k-test-1'

const comments = [
  {
    id: 'p1',
    pageId: 'pg',
    parentId: null,
    userId: null,
    authorName: 'Ada',
    bodyMarkdown: 'Parent message to reply to',
    status: 'visible',
    pinnedAt: null,
    createdAt: new Date().toISOString(),
    editedAt: null,
    score: 3,
    viewerVote: null,
    avatarUrl: null,
  },
  {
    id: 'c1',
    pageId: 'pg',
    parentId: 'p1',
    userId: null,
    authorName: 'Ben',
    bodyMarkdown: 'A reply',
    status: 'visible',
    pinnedAt: null,
    createdAt: new Date().toISOString(),
    editedAt: null,
    score: 0,
    viewerVote: null,
    avatarUrl: null,
  },
  // A deleted root as the service redacts it: no body, author, avatar or votes.
  {
    id: 'd1',
    pageId: 'pg',
    parentId: null,
    userId: null,
    authorName: '',
    bodyMarkdown: '',
    status: 'deleted',
    pinnedAt: null,
    createdAt: new Date().toISOString(),
    editedAt: null,
    score: 0,
    viewerVote: null,
    avatarUrl: null,
  },
]

const widgets = new URL('..', import.meta.url).pathname

// The fixture pages are built once per port; the server answers with whichever is current.
let bundle = ''
let framework: Framework = 'vanilla'
const server = Bun.serve({
  port: 0,
  fetch(request) {
    const path = new URL(request.url).pathname
    if (path === '/fixture.js') return new Response(bundle, { headers: { 'Content-Type': 'text/javascript' } })
    if (path === '/styles.css') return new Response(Bun.file(`${widgets}packages/${framework}/dist/styles.css`))
    if (path.startsWith('/files/')) return new Response(Bun.file(`${widgets}packages/${framework}/dist${path}`))
    return new Response(
      `<!doctype html><html><body><div id="root"></div><lc-settings-fixture></lc-settings-fixture>` +
        `<script type="module" src="/fixture.js"></script></body></html>`,
      { headers: { 'Content-Type': 'text/html' } },
    )
  },
})

const browser = await chromium.launch({ channel: Bun.env.THEME_BROWSER_CHANNEL ?? 'chrome', headless: true })
const problems: string[] = []
const results: Record<string, unknown> = {}

type Calls = { lists: number; votes: number; deleteKeys: (string | undefined)[] }

function accessFor(mode: Mode): 'open' | 'login' | 'private' {
  return mode.startsWith('private') ? 'private' : mode.startsWith('login') ? 'login' : 'open'
}

function check(label: string, name: string, actual: unknown, wanted: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(wanted))
    problems.push(`${label}: ${name} = ${JSON.stringify(actual)}, expected ${JSON.stringify(wanted)}`)
}

// One port's page in one mode and surface, with the settings, session, list, vote and delete calls served.
async function openPage(mode: Mode, surface: Surface, calls: Calls) {
  const signed = mode.endsWith('-signed')
  const access = accessFor(mode)
  const page = await browser.newPage({ viewport: { width: 760, height: 900 } })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  // A render that throws is often logged rather than raised, so console errors count too. The nosettings mode
  // answers its settings request with a 404 on purpose, and the browser logs that request.
  page.on('console', (message) => {
    const deliberate404 = mode === 'nosettings' && message.text().includes('status of 404')
    if (message.type() === 'error' && !deliberate404) pageErrors.push(message.text())
  })
  // A guest who wrote p1 on this browser holds its edit key, so the delete rule is exercised for guests.
  if (mode === 'open' || mode === 'login') {
    await page.addInitScript((key) => localStorage.setItem('lc.editKey.p1', key), EDIT_KEY)
  }

  await page.route('http://api.test/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    // Credentialed requests must echo the page origin, not a wildcard.
    const cors = {
      'access-control-allow-origin': request.headers().origin ?? '*',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE',
    }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    if (url.pathname === '/api/comments/settings') {
      if (mode === 'nosettings') return json({ error: { code: 'NOT_FOUND', message: 'nope' } }, 404)
      return json({
        data: {
          settings: {
            version: 1,
            access,
            bodyLimit: 500,
            anonEditWindowMinutes: 10,
            turnstileSiteKey: null,
            features: { votes: mode !== 'novotes' },
          },
        },
      })
    }
    if (url.pathname === '/api/auth/get-session') {
      return json(signed ? { user: { id: 'u1', name: 'Ada' } } : null)
    }
    if (url.pathname === '/api/comments') {
      calls.lists += 1
      return json({ data: { comments } })
    }
    if (url.pathname === '/api/comments/vote') {
      calls.votes += 1
      return json({ data: { vote: { score: 4, viewerVote: 1 } } })
    }
    if (url.pathname === '/api/comments/p1' && request.method() === 'DELETE') {
      calls.deleteKeys.push(request.headers()['x-lc-edit-key'])
      const row = comments.find((c) => c.id === 'p1')
      return json({
        data: {
          comment: { ...row, status: 'deleted', bodyMarkdown: '', authorName: '', userId: null, avatarUrl: null },
        },
      })
    }
    return json({ error: { code: 'NOT_FOUND', message: 'not in harness' } }, 404)
  })

  await page.goto(`${server.url.href}${surface === 'viewer' ? '?viewer' : ''}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  })
  await page.waitForTimeout(2500)
  return { page, pageErrors }
}

// The identity menu is the only place Anonymous is offered; report whether it is.
async function anonymousOffered(page: Page): Promise<boolean | 'no-trigger'> {
  const trigger = page.locator('.lc-identity-trigger').first()
  if ((await trigger.count()) === 0) return 'no-trigger'
  await trigger.click()
  await page.waitForTimeout(300)
  const offered = (await page.getByRole('menuitemradio', { name: 'Anonymous' }).count()) > 0
  await page.keyboard.press('Escape')
  return offered
}

try {
  for (framework of frameworks) {
    const entry = `${widgets}packages/${framework}/test/settings.fixture.ts`
    const built = await Bun.build({
      entrypoints: [entry],
      target: 'browser',
      define: { 'process.env.NODE_ENV': '"development"' },
    })
    if (!built.success) throw new AggregateError(built.logs, `Could not build the ${framework} settings fixture`)
    bundle = await built.outputs[0].text()

    for (const mode of modes) {
      const want = expected[mode]
      const label = `${framework}/${mode}`
      const calls: Calls = { lists: 0, votes: 0, deleteKeys: [] }
      const { page, pageErrors } = await openPage(mode, 'widget', calls)

      const measured = await page.evaluate((deletedText) => {
        const text = document.body.textContent ?? ''
        return {
          composer: document.querySelectorAll('textarea').length,
          prompts: document.querySelectorAll('[data-lc-signin]').length,
          cards: document.querySelectorAll('.lc-comment').length,
          deleted: text.split(deletedText).length - 1,
          votes: document.querySelectorAll('.lc-vote').length > 0,
          reply: Array.from(document.querySelectorAll('button')).filter((b) => b.textContent?.trim() === 'Reply')
            .length,
          text,
        }
      }, DELETED_TEXT)
      const anonymous = await anonymousOffered(page)
      const limitDigits = measured.text.match(/\/\s*([\d,]+)/)?.[1]
      const limit = limitDigits ? Number(limitDigits.replace(/,/g, '')) : null
      const signIn = measured.text.includes('Please sign in')
      check(label, 'composer', measured.composer > 0, want.composer)
      check(label, 'sign-in prompt', signIn, want.signIn)
      check(label, 'sign-in cards', measured.prompts, want.prompts)
      check(label, 'cards', measured.cards, want.cards)
      check(label, 'deleted placeholders', measured.deleted, want.deleted)
      check(label, 'vote arrows', measured.votes, want.votes)
      check(label, 'reply buttons', measured.reply > 0, want.reply)
      check(label, 'composer limit', want.limit === null ? null : limit, want.limit)
      check(label, 'list requests', calls.lists, want.lists)
      if (want.anonymous !== null) check(label, 'anonymous option', anonymous, want.anonymous)

      // A signed-out Reply on a login site opens the sign-in card where the form would be: no form, no request.
      let replyPrompt: boolean | null = null
      if (mode === 'login') {
        await page.getByRole('button', { name: 'Reply', exact: true }).first().click()
        await page.waitForTimeout(300)
        replyPrompt = (await page.locator('[data-signin-context="reply"]').count()) > 0
        check(label, 'reply prompt', replyPrompt, true)
        check(label, 'reply opens no form', await page.locator('textarea').count(), 0)
      }

      // A vote click: a guest is told to sign in with no request; a signed-in viewer sends one.
      let guestVote: 'sign-in' | 'request' | null = null
      if (want.guestVote !== null) {
        await page.getByRole('button', { name: 'Upvote' }).first().click()
        await page.waitForTimeout(400)
        // Every sign-in state shares one heading, "Please sign in", so that is what a guest's vote shows.
        const notice = /please sign in/i.test((await page.evaluate(() => document.body.textContent)) ?? '')
        guestVote = calls.votes === 0 && notice ? 'sign-in' : calls.votes === 1 ? 'request' : null
        check(label, 'vote click', guestVote, want.guestVote)
      }

      // The owner's delete: a guest holding the key sees Delete and sends the key in a header; a guest
      // without write access (login) sees no menu on that row at all.
      if (mode === 'open' || mode === 'login') {
        const trigger = page.locator('article[data-comment-id="p1"]').getByRole('button', { name: 'More actions' })
        if (mode === 'login') {
          check(label, 'delete menu for a guest who cannot write', await trigger.count(), 0)
        } else {
          await trigger.first().click()
          await page.waitForTimeout(300)
          // The menu is positioned outside the fixture's viewport, so the item is clicked on the element itself.
          await page
            .getByText('Delete', { exact: true })
            .first()
            .evaluate((el) => (el as HTMLElement).click())
          await page.waitForTimeout(500)
          check(label, 'delete sends the edit key', calls.deleteKeys, [EDIT_KEY])
          const after = await page.evaluate(
            (deletedText) => (document.body.textContent ?? '').split(deletedText).length - 1,
            DELETED_TEXT,
          )
          check(label, 'deleted row shows the placeholder', after, 2)
          // The reply under the deleted parent stays in the thread.
          check(
            label,
            'reply survives its parent’s delete',
            (await page.getByText('A reply', { exact: true }).count()) > 0,
            true,
          )
        }
      }

      results[label] = {
        composer: measured.composer,
        signIn,
        prompts: measured.prompts,
        cards: measured.cards,
        deleted: measured.deleted,
        votes: measured.votes,
        reply: measured.reply,
        replyPrompt,
        limit,
        lists: calls.lists,
        anonymous,
        guestVote,
        voteRequests: calls.votes,
        deleteKeys: calls.deleteKeys,
        pageErrors,
      }
      check(label, 'page errors', pageErrors.length, 0)
      await page.close()

      // The read-only viewer on the same policy: a private visitor gets one card and no list request.
      const viewerLabel = `${label}/viewer`
      const viewerCalls: Calls = { lists: 0, votes: 0, deleteKeys: [] }
      const viewer = await openPage(mode, 'viewer', viewerCalls)
      const viewerMeasured = await viewer.page.evaluate(() => ({
        cards: document.querySelectorAll('.lc-comment').length,
        prompts: document.querySelectorAll('[data-lc-signin]').length,
      }))
      check(viewerLabel, 'cards', viewerMeasured.cards, want.viewer.cards)
      check(viewerLabel, 'sign-in cards', viewerMeasured.prompts, want.viewer.prompts)
      check(viewerLabel, 'list requests', viewerCalls.lists, want.viewer.lists)
      check(viewerLabel, 'page errors', viewer.pageErrors.length, 0)
      results[viewerLabel] = { ...viewerMeasured, lists: viewerCalls.lists, pageErrors: viewer.pageErrors }
      await viewer.page.close()
    }
  }
  console.log(JSON.stringify(results, null, 1))
  if (problems.length > 0) {
    console.error(`\n${problems.length} settings expectation(s) failed:\n${problems.join('\n')}`)
    process.exitCode = 1
  } else {
    console.log(
      `\nAll ${frameworks.length * modes.length} port/mode combinations match the settings gate, for the widget and the viewer.`,
    )
  }
} finally {
  await browser.close()
  server.stop()
}
