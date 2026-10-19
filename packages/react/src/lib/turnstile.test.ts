import { afterEach, describe, expect, test } from 'bun:test'
import { createTurnstileLoader, resolveTurnstileConfig, type TurnstileApi } from './turnstile'

const SCRIPT_ID = 'cf-turnstile-script'
const SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback&render=explicit'

type FakeScript = {
  id: string
  src: string
  async: boolean
  defer: boolean
  onerror: (() => void) | null
  remove: () => void
}

type FakeDocument = {
  createElement: (tag: string) => FakeScript
  getElementById: (id: string) => FakeScript | null
  querySelector: (selector: string) => FakeScript | null
  head: { appendChild: (script: FakeScript) => void }
}

// The loader only touches document/window globals, so a plain object stands in
// for the DOM: no jsdom, no component mount, matching the repo's testing style.
function installDom(): { scripts: FakeScript[]; document: FakeDocument } {
  const scripts: FakeScript[] = []
  const document: FakeDocument = {
    createElement() {
      const script: FakeScript = {
        id: '',
        src: '',
        async: false,
        defer: false,
        onerror: null,
        remove() {
          const index = scripts.indexOf(script)
          if (index !== -1) scripts.splice(index, 1)
        },
      }
      return script
    },
    getElementById: (id) => scripts.find((script) => script.id === id) ?? null,
    querySelector(selector) {
      const match = /^script\[src="(.*)"\]$/.exec(selector)
      return match ? (scripts.find((script) => script.src === match[1]) ?? null) : null
    },
    head: {
      appendChild(script) {
        scripts.push(script)
      },
    },
  }
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true })
  return { scripts, document }
}

function setApi(api: TurnstileApi | undefined) {
  if (api) Object.defineProperty(globalThis, 'turnstile', { value: api, configurable: true })
  else Reflect.deleteProperty(globalThis, 'turnstile')
}

function fireOnload() {
  const callback = Object.getOwnPropertyDescriptor(globalThis, 'onloadTurnstileCallback')?.value
  if (typeof callback === 'function') callback()
}

function fakeApi(): TurnstileApi {
  return {
    render: () => 'widget-id',
    reset: () => {},
    remove: () => {},
  }
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'document')
  Reflect.deleteProperty(globalThis, 'turnstile')
  Reflect.deleteProperty(globalThis, 'onloadTurnstileCallback')
})

describe('loadTurnstile', () => {
  test('resolves with an already-loaded Turnstile and injects no script', async () => {
    const { scripts } = installDom()
    const ready = fakeApi()
    setApi(ready)

    await expect(createTurnstileLoader()()).resolves.toBe(ready)
    expect(scripts).toHaveLength(0)
  })

  test('injects one explicit-render script and resolves through its onload callback', async () => {
    const { scripts } = installDom()
    const load = createTurnstileLoader()
    const first = load()
    const second = load()

    expect(scripts).toHaveLength(1)
    expect(scripts[0]?.id).toBe(SCRIPT_ID)
    expect(scripts[0]?.src).toBe(SCRIPT_SRC)
    expect(scripts[0]?.async).toBe(true)
    expect(scripts[0]?.defer).toBe(true)

    const ready = fakeApi()
    setApi(ready)
    fireOnload()

    await expect(first).resolves.toBe(ready)
    await expect(second).resolves.toBe(ready)
    expect(Object.getOwnPropertyDescriptor(globalThis, 'onloadTurnstileCallback')).toBeUndefined()

    // Later callers share the cached API instead of loading the script again.
    await expect(load()).resolves.toBe(ready)
    expect(scripts).toHaveLength(1)
  })

  test('removes a failed script so the next mount can retry', async () => {
    const { scripts } = installDom()
    const load = createTurnstileLoader()
    const failed = load()

    scripts[0]?.onerror?.()

    await expect(failed).rejects.toThrow('Failed to load Turnstile')
    expect(scripts).toHaveLength(0)
    expect(Object.getOwnPropertyDescriptor(globalThis, 'onloadTurnstileCallback')).toBeUndefined()

    const retry = load()
    expect(scripts).toHaveLength(1)
    const ready = fakeApi()
    setApi(ready)
    fireOnload()
    await expect(retry).resolves.toBe(ready)
  })

  test('adopts a script tag that a host or hot reload left on the page', async () => {
    const { scripts, document } = installDom()
    const existing = document.createElement('script')
    existing.id = SCRIPT_ID
    document.head.appendChild(existing)

    const ready = fakeApi()
    const result = createTurnstileLoader()()
    // The loader polls an existing tag instead of injecting a duplicate.
    setTimeout(() => setApi(ready), 20)

    await expect(result).resolves.toBe(ready)
    expect(scripts).toHaveLength(1)
  })
})

describe('resolveTurnstileConfig', () => {
  test('follows the widget light/dark mode unless the host overrides the theme', () => {
    expect(resolveTurnstileConfig(true)).toEqual({ theme: 'dark' })
    expect(resolveTurnstileConfig(false)).toEqual({ theme: 'light' })
    expect(resolveTurnstileConfig(true, { theme: 'light' })).toEqual({ theme: 'light' })
    expect(resolveTurnstileConfig(false, { theme: 'auto' })).toEqual({ theme: 'auto' })
  })

  test('forwards the Cloudflare design knobs and omits unset ones', () => {
    expect(resolveTurnstileConfig(false, { size: 'compact', appearance: 'interaction-only', language: 'de' })).toEqual({
      theme: 'light',
      size: 'compact',
      appearance: 'interaction-only',
      language: 'de',
    })
    expect(resolveTurnstileConfig(true, { size: 'flexible' })).toEqual({ theme: 'dark', size: 'flexible' })
  })
})
