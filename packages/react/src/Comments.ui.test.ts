import { describe, expect, test } from 'bun:test'
import { UI_INITIAL, uiReducer } from './Comments'

const error = { code: null, title: 'Nope', message: 'Sign in first', action: 'sign-in' as const }

describe('uiReducer', () => {
  test('votes/pending flags one id without touching the others', () => {
    const one = uiReducer(UI_INITIAL, { type: 'votes/pending', id: 'c1', pending: true })
    const two = uiReducer(one, { type: 'votes/pending', id: 'c2', pending: true })
    expect(two.pendingVotes).toEqual({ c1: true, c2: true })
    expect(uiReducer(two, { type: 'votes/pending', id: 'c1', pending: false }).pendingVotes).toEqual({
      c1: false,
      c2: true,
    })
  })

  test('repeated sets are idempotent and keep unrelated keys by identity', () => {
    const one = uiReducer(UI_INITIAL, { type: 'votes/pending', id: 'c1', pending: true })
    const two = uiReducer(one, { type: 'votes/pending', id: 'c1', pending: true })
    expect(two.pendingVotes).toEqual({ c1: true })
    expect(two.pendingVotes).not.toBe(one.pendingVotes)
    expect(two.pendingModeration).toBe(one.pendingModeration)
  })

  test('moderation flags stay separate from vote flags', () => {
    const flagged = uiReducer(UI_INITIAL, { type: 'moderation/pending', id: 'c1', pending: true })
    expect(flagged.pendingModeration).toEqual({ c1: true })
    expect(flagged.pendingVotes).toEqual({})
  })

  test('posting, lock, signing and sign-in error transitions', () => {
    expect(uiReducer(UI_INITIAL, { type: 'posting/set', posting: true }).posting).toBe(true)
    expect(uiReducer(UI_INITIAL, { type: 'lock/set', pending: true }).lockPending).toBe(true)
    const signing = uiReducer(UI_INITIAL, { type: 'signing-in/set', value: true })
    expect(signing.signingIn).toBe(true)
    const failed = uiReducer(signing, { type: 'sign-in-error/set', error })
    expect(failed.signInError).toBe(error)
    expect(uiReducer(failed, { type: 'sign-in-error/set', error: null }).signInError).toBeNull()
    expect(uiReducer(UI_INITIAL, { type: 'signing-out/set', value: true }).signingOut).toBe(true)
  })

  test('unknown actions throw', () => {
    expect(() => uiReducer(UI_INITIAL, { type: 'nope' } as never)).toThrow()
  })
})
