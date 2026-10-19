import { describe, expect, test } from 'bun:test'
import type { ErrorInfo } from '@last-comments-widgets/client'
import { ITEM_INITIAL, itemReducer } from './item-state'

const failure: ErrorInfo = { code: 'FORBIDDEN', title: "Your edit wasn't saved", message: 'nope', action: 'none' }

describe('itemReducer', () => {
  test('edit/open opens the editor', () => {
    expect(itemReducer(ITEM_INITIAL, { type: 'edit/open' }).editing).toBe(true)
  })

  test('edit/close also clears the error', () => {
    const state = itemReducer(itemReducer(ITEM_INITIAL, { type: 'edit/open' }), { type: 'edit/settle', error: failure })
    expect(itemReducer(state, { type: 'edit/close' })).toMatchObject({ editing: false, editError: null })
  })

  test('edit/settle success closes the editor', () => {
    const state = itemReducer(ITEM_INITIAL, { type: 'edit/open' })
    expect(itemReducer(state, { type: 'edit/settle', error: null })).toMatchObject({ editing: false, editError: null })
  })

  test('edit/settle failure keeps the editor open with its error', () => {
    const state = itemReducer(ITEM_INITIAL, { type: 'edit/open' })
    expect(itemReducer(state, { type: 'edit/settle', error: failure })).toMatchObject({
      editing: true,
      editError: failure,
    })
  })

  test('saving/set toggles the pending flag', () => {
    const saved = itemReducer(ITEM_INITIAL, { type: 'saving/set', saving: true })
    expect(saved.saving).toBe(true)
    expect(itemReducer(saved, { type: 'saving/set', saving: false }).saving).toBe(false)
  })

  test('reply/submit then reply/settle clears the error', () => {
    const submitting = itemReducer(ITEM_INITIAL, { type: 'reply/submit' })
    expect(submitting.replying).toBe(true)
    expect(itemReducer(submitting, { type: 'reply/settle', error: failure }).replyError).toBe(failure)
    expect(itemReducer(submitting, { type: 'reply/settle', error: null }).replyError).toBeNull()
  })

  test('replying/set toggles the reply composer', () => {
    expect(itemReducer(ITEM_INITIAL, { type: 'replying/set', replying: false }).replying).toBe(false)
  })

  test('collapse/toggle stores the override', () => {
    expect(itemReducer(ITEM_INITIAL, { type: 'collapse/toggle', value: true }).collapsedOverride).toBe(true)
    expect(itemReducer(ITEM_INITIAL, { type: 'collapse/toggle', value: false }).collapsedOverride).toBe(false)
  })

  test('unknown actions throw', () => {
    expect(() => itemReducer(ITEM_INITIAL, { type: 'nope' } as never)).toThrow('Unknown comment item action')
  })
})
