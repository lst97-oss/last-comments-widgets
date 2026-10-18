import { expect } from 'bun:test'
import { chromium } from 'playwright-core'

const frameworks = ['vanilla', 'react', 'vue', 'angular'] as const
let bundle = ''
let framework: (typeof frameworks)[number] = 'react'
const comment = {
  id: 'parent',
  pageId: 'page',
  parentId: null,
  userId: 'u1',
  authorName: 'Ada',
  bodyMarkdown: '**Themed** comment',
  status: 'visible',
  pinnedAt: null,
  createdAt: new Date().toISOString(),
  editedAt: null,
  score: 1,
  viewerVote: null,
}
const reactPath = new URL('../packages/react', import.meta.url).pathname
const { createElement } = await import(Bun.resolveSync('react', reactPath))
const { renderToString } = await import(Bun.resolveSync('react-dom/server', reactPath))
const { CommentsTheme } = await import('../packages/react/dist/index.js')
const hydrationHtml = renderToString(
  createElement(
    CommentsTheme,
    {
      id: 'hydration-theme',
      themeVars: { dark: { primary: '#ffee00' } },
    },
    'Hydration',
  ),
)
const server = Bun.serve({
  port: 0,
  fetch(request) {
    const path = new URL(request.url).pathname
    if (path === '/fixture.js') return new Response(bundle, { headers: { 'Content-Type': 'text/javascript' } })
    if (path === '/styles.css') return new Response(Bun.file(`packages/${framework}/dist/styles.css`))
    if (path.startsWith('/files/')) return new Response(Bun.file(`packages/${framework}/dist${path}`))
    if (path === '/api/auth/get-session') return Response.json({ user: { id: 'u1', name: 'Ada' } })
    if (path === '/api/comments')
      return Response.json({ data: { comments: [comment, { ...comment, id: 'reply', parentId: 'parent' }] } })
    return new Response(
      `<!doctype html><html><body class="dark" style="font-family:serif;color:rgb(70,80,90);background:rgb(200,210,220)">
      <style>*,::before,::after{transition:none!important;animation:none!important}</style>
      <h1 id="host" class="grid bg-primary border rounded-lg">Host heading</h1><button id="host-button">Host button</button>
      <div id="hydration">${framework === 'react' ? hydrationHtml : ''}</div>
      <lc-theme-fixture id="fixtures"></lc-theme-fixture><script type="module" src="/fixture.js"></script>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } },
    )
  },
})
const browser = await chromium.launch({ channel: Bun.env.THEME_BROWSER_CHANNEL ?? 'chrome', headless: true })
try {
  for (framework of frameworks) {
    const entry =
      framework === 'vanilla'
        ? 'packages/vanilla/test/theme.fixture.ts'
        : `examples/${framework}/src/theme.fixture.${framework === 'react' ? 'tsx' : 'ts'}`
    const built = await Bun.build({
      entrypoints: [entry],
      target: 'browser',
      define: { 'process.env.NODE_ENV': '"development"' },
    })
    if (!built.success) throw new AggregateError(built.logs, `Could not build ${framework} fixture`)
    bundle = await built.outputs[0].text()
    const page = await browser.newPage({ colorScheme: 'dark' })
    const pageErrors: Error[] = []
    page.on('pageerror', (error) => pageErrors.push(error))
    await page.goto(server.url.href)
    await page.waitForFunction(() =>
      ['a', 'b', 'viewer'].every((id) => document.querySelectorAll(`#${id} .lc-comment`).length === 2),
    )
    const hostStyles = () =>
      page.locator('#host, #host-button, body').evaluateAll((elements) =>
        elements.map((element) => {
          const style = getComputedStyle(element)
          return [
            style.display,
            style.margin,
            style.padding,
            style.borderWidth,
            style.color,
            style.backgroundColor,
            style.fontFamily,
            style.fontSize,
          ]
        }),
      )
    if (framework === 'react') {
      expect(await page.locator('#hydration-theme').getAttribute('class')).toContain('dark')
      expect(
        await page
          .locator('#hydration-theme')
          .evaluate((element) => (element as HTMLElement).style.getPropertyValue('--primary')),
      ).toBe('#ffee00')
    }
    const before = await hostStyles()
    await page.addStyleTag({ url: `${server.url}styles.css` })
    expect(await hostStyles()).toEqual(before)
    const root = page.locator('#a.lc-comments, #a .lc-comments').first()
    const viewer = page.locator('#viewer.lc-comments, #viewer .lc-comments').first()
    const other = page.locator('#b.lc-comments, #b .lc-comments').first()
    const style = (locator: typeof root, property: string) =>
      locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property)
    expect(await style(root, 'background-color')).toBe('rgb(238, 244, 255)')
    expect(await style(root, 'color')).toBe('rgb(17, 34, 51)')
    expect(await style(root, 'font-family')).toContain('Georgia')
    expect(await style(root, 'font-size')).toBe('20px')
    expect(await style(root, 'display')).toBe('grid')
    expect(await style(root, 'row-gap')).toBe('24px')
    expect(await style(root.locator('.lc-markdown').first(), 'font-size')).toBe('17.5px')
    expect(await style(root.locator('.lc-composer').first(), 'padding-top')).toBe('22px')
    expect(await style(root.locator('.lc-comment').first(), 'padding-top')).toBe('18px')
    expect(await style(root.locator('.lc-reply').first(), 'padding-left')).toBe('42px')
    expect(await style(root.locator('.lc-comment').first(), 'box-shadow')).toContain('rgb(1, 2, 3)')
    expect(await style(viewer.locator('.lc-comment').first(), 'padding-top')).toBe('18px')
    expect(await style(other, 'color-scheme')).toBe('light')
    const trigger = root.locator('.lc-identity-trigger')
    expect(await style(trigger, 'min-height')).toBe('44px')
    expect(await style(trigger, 'border-radius')).toBe('7px')
    const otherTrigger = other.locator('.lc-identity-trigger')
    const withDarkHost = await style(otherTrigger, 'background-color')
    await page.locator('body').evaluate((element) => element.classList.remove('dark'))
    expect(await style(otherTrigger, 'background-color')).toBe(withDarkHost)
    await page.locator('body').evaluate((element) => element.classList.add('dark'))
    await page.addStyleTag({
      content: `
      #b.lc-comments, #b .lc-comments { --popover: #ddeeff; --lc-control-radius: 3px; }
      #b .lc-comment { padding: 3px; }
      #b .lc-identity-menu { border: 2px solid rgb(10 20 30); }
    `,
    })
    expect(await style(other.locator('.lc-comment').first(), 'padding-top')).toBe('3px')
    expect(await style(root.locator('.lc-comment').first(), 'padding-top')).toBe('18px')
    await otherTrigger.click()
    const otherMenu = other.locator('.lc-identity-menu')
    await otherMenu.waitFor({ state: 'visible' })
    expect(await style(otherMenu, 'background-color')).toBe('rgb(221, 238, 255)')
    expect(await style(otherMenu, 'border-top-width')).toBe('2px')
    expect(await style(otherTrigger, 'border-radius')).toBe('3px')
    await page.keyboard.press('Escape')
    const beforeMenuHeight = await root.evaluate((element) => element.getBoundingClientRect().height)
    await trigger.click()
    const menu = root.locator('.lc-identity-menu')
    await menu.waitFor({ state: 'visible' })
    expect(await style(menu, 'background-color')).toBe('rgb(51, 34, 17)')
    expect(await style(menu, 'color')).toBe('rgb(17, 34, 51)')
    expect(await style(menu, 'box-shadow')).toBe('none')
    expect(await style(menu, 'font-family')).toContain('Georgia')
    expect(await root.evaluate((element) => element.getBoundingClientRect().height)).toBe(beforeMenuHeight)
    const anonymous = menu.getByRole('menuitemradio', { name: 'Anonymous', exact: true })
    await anonymous.hover()
    expect(await style(anonymous, 'background-color')).toBe('rgb(202, 254, 0)')
    expect(await style(anonymous, 'color')).toBe('rgb(17, 0, 34)')
    await page.keyboard.press('Escape')
    if (framework === 'react') {
      await root.getByRole('button', { name: 'Delete', exact: true }).first().click()
      const dialog = root.getByRole('alertdialog')
      await dialog.waitFor({ state: 'visible' })
      expect(await style(dialog, 'font-family')).toContain('Georgia')
      expect(await style(dialog, 'background-color')).toBe('rgb(51, 34, 17)')
      expect(await style(dialog, 'box-shadow')).toBe('none')
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      const standalone = page.locator('#standalone')
      await standalone.getByRole('button', { name: 'Delete', exact: true }).click()
      const standaloneDialog = standalone.getByRole('alertdialog')
      await standaloneDialog.waitFor({ state: 'visible' })
      expect(await style(standaloneDialog, 'background-color')).toBe('rgb(51, 34, 17)')
      await standaloneDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    }
    await page.emulateMedia({ colorScheme: 'light' })
    await page.waitForFunction(
      () => !document.querySelector('#a.lc-comments, #a .lc-comments')?.classList.contains('dark'),
    )
    expect(await root.evaluate((element) => (element as HTMLElement).style.getPropertyValue('--destructive'))).toBe('')
    expect(await viewer.evaluate((element) => (element as HTMLElement).style.getPropertyValue('--destructive'))).toBe(
      '',
    )
    await trigger.click()
    await menu.waitFor({ state: 'visible' })
    expect(await style(menu, 'background-color')).toBe('rgb(254, 220, 186)')
    await page.keyboard.press('Escape')
    await page.evaluate(() => window.updateTheme({ vars: { primary: '#ff0000', popover: '#eeffee' } }))
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>('#a.lc-comments, #a .lc-comments')?.style.getPropertyValue('--primary') ===
        '#ff0000',
    )
    expect(await style(root, 'font-family')).not.toContain('Georgia')
    expect(await style(root.locator('.lc-comment').first(), 'padding-top')).toBe('0px')
    expect(await style(viewer.locator('.lc-comment').first(), 'box-shadow')).toBe('none')
    await page.screenshot({ path: `.tmp/theme-${framework}.png`, fullPage: true })
    expect(pageErrors).toHaveLength(0)
    await page.close()
    console.log(`${framework}: host isolation, theme tokens, selector, viewer and mode changes passed`)
  }
} finally {
  await browser.close()
  await server.stop(true)
}
