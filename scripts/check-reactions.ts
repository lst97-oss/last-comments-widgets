// Browser check of emoji reactions across all four ports. Both reaction switches are on for the site. Playwright
// serves the settings endpoint, the session, the thread and the reaction routes, and records every write each port
// makes. A guest's click must send nothing and show the sign-in notice; a signed-in click must send one write and
// move the chip to the server's answer.
import { chromium, type Page } from 'playwright-core'

const frameworks = ['vanilla', 'react', 'vue', 'angular'] as const
type Framework = (typeof frameworks)[number]

const modes = ['guest', 'signed'] as const
type Mode = (typeof modes)[number]

const EMOJI: string[] = ['👍', '❤️', '😄', '🎉', '😮', '👀']
const SITE = 's'
const PAGE_URL = 'http://localhost/p'

type Reaction = { emoji: string; count: number; viewerReacted: boolean }
type Write = { method: string; path: string; body: Record<string, string> }

const widgets = new URL('..', import.meta.url).pathname
const problems: string[] = []
const results: Record<string, unknown> = {}

// The same reaction arithmetic the server does: one reaction per viewer per emoji, counts kept in allowlist order.
function apply(list: Reaction[], emoji: string, on: boolean): Reaction[] {
  const current = list.find((reaction) => reaction.emoji === emoji) ?? { emoji, count: 0, viewerReacted: false }
  const next = {
    emoji,
    count: Math.max(0, current.count + (on === current.viewerReacted ? 0 : on ? 1 : -1)),
    viewerReacted: on,
  }
  const rest = list.filter((reaction) => reaction.emoji !== emoji)
  return [...rest, next]
    .filter((reaction) => reaction.count > 0)
    .sort((a, b) => EMOJI.indexOf(a.emoji) - EMOJI.indexOf(b.emoji))
}

const comment = {
  id: 'c1',
  pageId: 'page-1',
  parentId: null,
  userId: 'u2',
  authorName: 'Grace',
  avatarUrl: null,
  bodyMarkdown: 'Reactions on a comment',
  status: 'visible',
  pinnedAt: null,
  createdAt: '2026-10-17T00:00:00.000Z',
  editedAt: null,
  authorRole: null,
  score: 0,
  viewerVote: null,
  reactions: [{ emoji: '👍', count: 2, viewerReacted: false }],
}

const widgetsServer = Bun.serve({
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

// The fixture pages are built once per port; the server answers with whichever is current.
let bundle = ''
let framework: Framework = 'vanilla'

// CI passes the Chrome for Testing binary its setup step installed; locally the installed Chrome is used.
const launch = Bun.env.CHROME_PATH
  ? { executablePath: Bun.env.CHROME_PATH }
  : { channel: Bun.env.THEME_BROWSER_CHANNEL ?? 'chrome' }
const browser = await chromium.launch({ ...launch, headless: true })

// One port in one mode: the stubbed API, the page, and the writes the port made.
// `holdPageRead` keeps the page-bar read on the wire until a press has been answered; `expired` refuses every
// reaction write with the server's 401.
async function openPage(mode: Mode, options: { holdPageRead?: boolean; expired?: boolean } = {}) {
  const signed = mode === 'signed'
  const page = await browser.newPage({ viewport: { width: 760, height: 900 } })
  const pageErrors: string[] = []
  const writes: Write[] = []
  let commentReactions: Reaction[] = [...comment.reactions]
  let pageReactions: Reaction[] = [{ emoji: '🎉', count: 1, viewerReacted: false }]
  const pressAnswered = Promise.withResolvers<void>()
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    // A refused write is logged by the browser as a failed request; the widget's own copy is what the check reads.
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
      pageErrors.push(message.text())
    }
  })

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
      route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const bodyOf = (): Record<string, string> =>
      request.method() === 'DELETE' || request.method() === 'GET'
        ? Object.fromEntries(url.searchParams)
        : JSON.parse(request.postData() ?? '{}')

    if (url.pathname === '/api/comments/settings') {
      return json({
        data: {
          settings: {
            version: 1,
            access: 'open',
            bodyLimit: 500,
            anonEditWindowMinutes: 10,
            turnstileSiteKey: null,
            features: { votes: true, pageReactions: [...EMOJI], commentReactions: [...EMOJI] },
          },
        },
      })
    }
    if (url.pathname === '/api/auth/get-session') {
      return json(signed ? { user: { id: 'u1', name: 'Ada' } } : null)
    }
    if (url.pathname === '/api/comments') {
      return json({ data: { comments: [{ ...comment, reactions: commentReactions }] } })
    }
    if (url.pathname === '/api/comments/reactions') {
      if (options.expired) return json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to react' } }, 401)
      const body = bodyOf()
      writes.push({ method: request.method(), path: url.pathname, body })
      commentReactions = apply(commentReactions, body.emoji ?? '', request.method() === 'PUT')
      return json({ data: { reactions: commentReactions } })
    }
    if (url.pathname === '/api/comments/page-reactions') {
      if (request.method() === 'GET') {
        // The answer is what the server held when the read arrived, whenever it is sent.
        const snapshot = pageReactions
        if (options.holdPageRead) await pressAnswered.promise
        return json({ data: { reactions: snapshot } })
      }
      if (options.expired) return json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to react' } }, 401)
      const body = bodyOf()
      writes.push({ method: request.method(), path: url.pathname, body })
      pageReactions = apply(pageReactions, body.emoji ?? '', request.method() === 'PUT')
      pressAnswered.resolve()
      return json({ data: { reactions: pageReactions } })
    }
    return json({ error: { code: 'NOT_FOUND', message: 'not in harness' } }, 404)
  })

  await page.goto(`${widgetsServer.url.href}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(2500)
  return { page, pageErrors, writes }
}

function chip(page: Page, label: string) {
  return page.getByRole('button', { name: label, exact: true })
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
    const output = built.outputs[0]
    if (!output) throw new Error(`The ${framework} settings fixture built no output`)
    bundle = await output.text()

    for (const mode of modes) {
      const label = `${framework}/${mode}`
      const { page, pageErrors, writes } = await openPage(mode)
      const seen: Record<string, unknown> = {
        commentChip: (await chip(page, '👍, 2 reactions').count()) > 0,
        pageChip: (await chip(page, '🎉, 1 reaction').count()) > 0,
        pageBarChips: await page.getByRole('group', { name: 'Reactions to this page' }).getByRole('button').count(),
      }
      if (!seen.commentChip) problems.push(`${label}: comment chip "👍, 2 reactions" not shown`)
      if (!seen.pageChip) problems.push(`${label}: page chip "🎉, 1 reaction" not shown`)
      if (seen.pageBarChips !== EMOJI.length)
        problems.push(`${label}: page bar shows ${seen.pageBarChips} chips, expected ${EMOJI.length}`)

      if (mode === 'guest') {
        // A guest's click is refused before any request: no write, and the sign-in notice.
        await chip(page, '👍, 2 reactions').first().click()
        await page.waitForTimeout(400)
        const notice = ((await page.evaluate(() => document.body.textContent)) ?? '').includes('Sign in to react')
        seen.guestClickWrites = writes.length
        seen.guestNotice = notice
        if (writes.length !== 0) problems.push(`${label}: a guest's click sent ${writes.length} write(s)`)
        if (!notice) problems.push(`${label}: a guest's click did not show "Sign in to react"`)
      } else {
        // A signed-in click on the comment's chip sends one write and moves the chip to the server's answer.
        await chip(page, '👍, 2 reactions').first().click()
        await page.waitForTimeout(500)
        const commentWrite = writes.find((write) => write.path === '/api/comments/reactions')
        if (!commentWrite) problems.push(`${label}: comment click sent no write`)
        else if (JSON.stringify(commentWrite.body) !== JSON.stringify({ site: SITE, commentId: 'c1', emoji: '👍' }))
          problems.push(`${label}: comment write body ${JSON.stringify(commentWrite.body)}`)
        const moved = await chip(page, '👍, 3 reactions').getAttribute('aria-pressed')
        seen.commentChipAfter = moved
        if (moved !== 'true') problems.push(`${label}: comment chip after click is not "👍, 3 reactions" pressed`)

        // A signed-in click on the page bar sends one page write and updates that chip.
        await chip(page, '🎉, 1 reaction').first().click()
        await page.waitForTimeout(500)
        const pageWrite = writes.find((write) => write.path === '/api/comments/page-reactions')
        if (!pageWrite) problems.push(`${label}: page click sent no write`)
        else if (JSON.stringify(pageWrite.body) !== JSON.stringify({ site: SITE, url: PAGE_URL, emoji: '🎉' }))
          problems.push(`${label}: page write body ${JSON.stringify(pageWrite.body)}`)
        const pageAfter = await chip(page, '🎉, 2 reactions').getAttribute('aria-pressed')
        seen.pageChipAfter = pageAfter
        if (pageAfter !== 'true') problems.push(`${label}: page chip after click is not "🎉, 2 reactions" pressed`)
        seen.writes = writes.length
      }

      if (pageErrors.length > 0) problems.push(`${label}: ${pageErrors.length} page error(s): ${pageErrors[0]}`)
      results[label] = { ...seen, pageErrors }
      await page.close()
    }

    // Two more signed-in cases per port. A read that finished after a press must not undo it, and a press the
    // server refuses with 401 must say that the reader needs to sign in to react, and must not change the chip.
    for (const scenario of ['race', 'expired'] as const) {
      const label = `${framework}/${scenario}`
      const { page, pageErrors } = await openPage(
        'signed',
        scenario === 'race' ? { holdPageRead: true } : { expired: true },
      )
      if (scenario === 'race') {
        await chip(page, '🎉, 0 reactions').click()
        await page.waitForTimeout(800)
        // Without the page-bar guard the stale read replaces the press, so this chip never appears.
        const pressed = await chip(page, '🎉, 2 reactions')
          .getAttribute('aria-pressed', { timeout: 2000 })
          .catch(() => null)
        if (pressed !== 'true') {
          problems.push(`${label}: a read that finished after a press undid it (no pressed "🎉, 2 reactions")`)
        }
      } else {
        await chip(page, '👍, 2 reactions').first().click()
        await page.waitForTimeout(500)
        const notice = ((await page.evaluate(() => document.body.textContent)) ?? '').includes('Sign in to react')
        const pressed = await chip(page, '👍, 2 reactions').first().getAttribute('aria-pressed')
        if (!notice) problems.push(`${label}: a refused press did not show "Sign in to react"`)
        if (pressed !== 'false') problems.push(`${label}: a refused press changed the chip (pressed ${pressed})`)
      }
      if (pageErrors.length > 0) problems.push(`${label}: ${pageErrors.length} page error(s): ${pageErrors[0]}`)
      results[label] = { pageErrors }
      await page.close()
    }
  }
  console.log(JSON.stringify(results, null, 1))
  if (problems.length > 0) {
    console.error(`\n${problems.length} reaction expectation(s) failed:\n${problems.join('\n')}`)
    process.exitCode = 1
  } else {
    console.log(
      `\nAll ${frameworks.length * (modes.length + 2)} port/scenario combinations behave as the reaction rules say.`,
    )
  }
} finally {
  await browser.close()
  widgetsServer.stop()
}
