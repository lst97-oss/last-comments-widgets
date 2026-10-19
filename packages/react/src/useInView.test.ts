import { describe, expect, test } from 'bun:test'
import { observeInView } from './useInView'

type Entry = { isIntersecting: boolean }

function fakeObserver() {
  const state = {
    constructed: 0,
    observed: [] as Element[],
    disconnected: 0,
    callback: undefined as ((entries: Entry[]) => void) | undefined,
  }
  class FakeObserver {
    constructor(callback: (entries: Entry[]) => void) {
      state.constructed += 1
      state.callback = callback
    }
    observe(node: Element) {
      state.observed.push(node)
    }
    disconnect() {
      state.disconnected += 1
      // Like the real observer: no callbacks after disconnect.
      state.callback = undefined
    }
  }
  return { state, ctor: FakeObserver as unknown as typeof IntersectionObserver }
}

const node = {} as Element

describe('observeInView', () => {
  test('non-lazy entries resolve immediately without observing', () => {
    const { state, ctor } = fakeObserver()
    let entered = 0
    const cleanup = observeInView(node, false, ctor, () => {
      entered += 1
    })
    expect(entered).toBe(1)
    expect(state.constructed).toBe(0)
    expect(cleanup).toBeUndefined()
  })

  test('a missing IntersectionObserver resolves immediately', () => {
    let entered = 0
    observeInView(node, true, undefined, () => {
      entered += 1
    })
    expect(entered).toBe(1)
  })

  test('a missing node never enters', () => {
    const { state, ctor } = fakeObserver()
    let entered = 0
    observeInView(null, true, ctor, () => {
      entered += 1
    })
    expect(entered).toBe(0)
    expect(state.observed).toEqual([])
  })

  test('enters once when intersecting and disconnects', () => {
    const { state, ctor } = fakeObserver()
    let entered = 0
    observeInView(node, true, ctor, () => {
      entered += 1
    })
    expect(state.observed).toEqual([node])
    state.callback?.([{ isIntersecting: false }])
    expect(entered).toBe(0)
    state.callback?.([{ isIntersecting: true }])
    state.callback?.([{ isIntersecting: true }])
    expect(entered).toBe(1)
    expect(state.disconnected).toBe(1)
  })

  test('cleanup disconnects a live observer', () => {
    const { state, ctor } = fakeObserver()
    const cleanup = observeInView(node, true, ctor, () => {})
    cleanup?.()
    expect(state.disconnected).toBe(1)
  })
})
