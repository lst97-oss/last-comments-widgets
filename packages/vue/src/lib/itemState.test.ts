import { describe, expect, test } from 'bun:test'
import { ITEM_INITIAL, type ItemState, itemReducer } from './itemState'

const error = { code: 'VALIDATION_ERROR', title: 'Nope', message: 'Too long', action: 'none' as const }

describe('itemReducer', () => {
  test('a failed save keeps the editor open and stores the error', () => {
    const open = itemReducer(ITEM_INITIAL, { type: 'edit/open' })
    const failed = itemReducer(open, { type: 'edit/settle', error })
    expect(failed.editing).toBe(true)
    expect(failed.editError).toBe(error)
  })

  test('a successful save closes the editor and clears the error', () => {
    const open = itemReducer(ITEM_INITIAL, { type: 'edit/open' })
    const failed = itemReducer(open, { type: 'edit/settle', error })
    const saved = itemReducer(failed, { type: 'edit/settle', error: null })
    expect(saved.editing).toBe(false)
    expect(saved.editError).toBeNull()
  })

  test('cancel closes the editor and clears the error', () => {
    const failed = itemReducer(itemReducer(ITEM_INITIAL, { type: 'edit/open' }), { type: 'edit/settle', error })
    const closed = itemReducer(failed, { type: 'edit/close' })
    expect(closed).toMatchObject({ editing: false, editError: null })
  })

  test('pending flags round-trip independently', () => {
    const saving = itemReducer(ITEM_INITIAL, { type: 'saving/set', saving: true })
    expect(saving.saving).toBe(true)
    expect(saving.replying).toBe(false)
    const replying = itemReducer(saving, { type: 'reply/submit' })
    expect(replying).toMatchObject({ saving: true, replying: true })
    expect(itemReducer(replying, { type: 'replying/set', replying: false }).replying).toBe(false)
  })

  test('collapse/toggle sets the explicit override from either seed', () => {
    expect(itemReducer(ITEM_INITIAL, { type: 'collapse/toggle', value: true }).collapsedOverride).toBe(true)
    const collapsed: ItemState = { ...ITEM_INITIAL, collapsedOverride: true }
    expect(itemReducer(collapsed, { type: 'collapse/toggle', value: false }).collapsedOverride).toBe(false)
  })

  test('unknown actions throw', () => {
    expect(() => itemReducer(ITEM_INITIAL, { type: 'nope' } as never)).toThrow()
  })
})
