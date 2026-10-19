import { describe, expect, test } from 'bun:test'
import { describeError } from '@last-comments-widgets/client'
import { setPending, useCommentsUi } from './useCommentsUi'

describe('setPending', () => {
  test('replaces one flag without touching the others', () => {
    const before = { a: true, b: false }
    const after = setPending(before, 'c', true)
    expect(after).toEqual({ a: true, b: false, c: true })
    expect(before).toEqual({ a: true, b: false })
    expect(setPending(after, 'a', false)).toEqual({ a: false, b: false, c: true })
  })
})

describe('useCommentsUi', () => {
  test('clearError drops the action error and leaves the rest alone', () => {
    const ui = useCommentsUi()
    ui.actionError.value = describeError(new Error('boom'))
    ui.lockPending.value = true
    ui.unauthenticated.value = true
    ui.clearError()
    expect(ui.actionError.value).toBeNull()
    expect(ui.lockPending.value).toBe(true)
    expect(ui.unauthenticated.value).toBe(true)
    expect(ui.pendingModeration.value).toEqual({})
  })
})
