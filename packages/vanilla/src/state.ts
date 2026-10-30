// Item and widget state, the reducer that moves it, and the vote overlay.

import type { Comment, ErrorInfo, ReactionSummary, ThreadSort, VoteValue } from '@last-comments-widgets/client'
import { EDIT_WINDOW_CLOSED, isEditWindowOpen, resolveEditWindow } from '@last-comments-widgets/client'

// Mirror of the React editGate: signed-in owners edit any time; a guest owns the
// comment only while this browser still holds its key, inside the anon window.
export function canEditComment(
  comment: { userId?: string | null; createdAt: string },
  viewerUserId?: string,
  options: { anonWindowMinutes?: number; hasEditKey?: boolean } = {},
): boolean {
  const windowMinutes = resolveEditWindow({
    commentUserId: comment.userId,
    viewerUserId,
    hasEditKey: options.hasEditKey,
    ...(options.anonWindowMinutes === undefined ? {} : { anonymousWindowMinutes: options.anonWindowMinutes }),
  })
  if (windowMinutes === EDIT_WINDOW_CLOSED) return false
  return isEditWindowOpen(comment.createdAt, Date.now(), windowMinutes)
}

// One row owns three mutually-exclusive UI slots (editor, reply composer,
// body) plus their pending/error flags — the same item state as React.
export type ItemState = {
  editing: boolean
  saving: boolean
  editError: ErrorInfo | null
  replying: boolean
  replyError: ErrorInfo | null
  collapsedOverride: boolean | null
}

export const ITEM_INITIAL: ItemState = {
  editing: false,
  saving: false,
  editError: null,
  replying: false,
  replyError: null,
  collapsedOverride: null,
}

export type UiState = {
  replyTo: string | null
  sort: ThreadSort
  page: number
  // Per-row slot state, keyed by comment id.
  items: Record<string, ItemState>
  identityOpen: boolean
  needsSignIn: boolean
  actionError: ErrorInfo | null
  pendingModeration: Record<string, boolean>
  lockPending: boolean
  signInPending: boolean
  signOutPending: boolean
  // The head composer is posting: its button shows the loading state.
  posting: boolean
  // The identity error plus the flow its own retry button must re-run.
  identityError: { info: ErrorInfo; retry: 'signin' | 'signout' } | null
}

export type UiAction =
  | { type: 'reply'; value: string | null }
  | { type: 'edit/open'; id: string }
  | { type: 'edit/close'; id: string }
  | { type: 'edit/settle'; id: string; error: ErrorInfo | null }
  | { type: 'saving/set'; id: string; saving: boolean }
  | { type: 'reply/submit'; id: string }
  | { type: 'reply/settle'; id: string; error: ErrorInfo | null }
  | { type: 'replying/set'; id: string; replying: boolean }
  | { type: 'collapse/toggle'; id: string; value: boolean }
  | { type: 'sort/set'; value: ThreadSort }
  | { type: 'page/set'; value: number }
  | { type: 'identity/open'; value: boolean }
  | { type: 'identity/error'; value: UiState['identityError'] }
  | { type: 'signin/pending'; value: boolean }
  | { type: 'signout/pending'; value: boolean }
  | { type: 'signin/needed'; value: boolean }
  | { type: 'error'; value: ErrorInfo | null }
  | { type: 'moderation/pending'; id: string; value: boolean }
  | { type: 'lock/pending'; value: boolean }
  | { type: 'posting/set'; value: boolean }

export const UI_INITIAL: UiState = {
  replyTo: null,
  sort: 'newest',
  page: 1,
  items: {},
  identityOpen: false,
  needsSignIn: false,
  actionError: null,
  pendingModeration: {},
  lockPending: false,
  signInPending: false,
  signOutPending: false,
  posting: false,
  identityError: null,
}

// Pure so bun test covers every transition without a browser.
export function transition(state: UiState, action: UiAction): UiState {
  const patchItem = (id: string, patch: Partial<ItemState>): UiState => ({
    ...state,
    items: { ...state.items, [id]: { ...(state.items[id] ?? ITEM_INITIAL), ...patch } },
  })
  switch (action.type) {
    case 'reply':
      return { ...state, replyTo: action.value }
    case 'edit/open':
      return patchItem(action.id, { editing: true })
    case 'edit/close':
      return patchItem(action.id, { editing: false, editError: null })
    // A failed save keeps the editor (and its draft) open; Cancel is the way out.
    case 'edit/settle':
      return patchItem(action.id, {
        editError: action.error,
        editing: action.error === null ? false : (state.items[action.id] ?? ITEM_INITIAL).editing,
      })
    case 'saving/set':
      return patchItem(action.id, { saving: action.saving })
    case 'reply/submit':
      return patchItem(action.id, { replying: true })
    case 'reply/settle':
      return patchItem(action.id, { replyError: action.error })
    case 'replying/set':
      return patchItem(action.id, { replying: action.replying })
    case 'collapse/toggle':
      return patchItem(action.id, { collapsedOverride: action.value })
    // Window boundaries follow the new order, so a sort change starts at page 1.
    case 'sort/set':
      return { ...state, sort: action.value, page: 1 }
    case 'page/set':
      return { ...state, page: action.value }
    case 'identity/open':
      return { ...state, identityOpen: action.value }
    case 'identity/error':
      return { ...state, identityError: action.value }
    case 'signin/pending':
      return { ...state, signInPending: action.value }
    case 'signout/pending':
      return { ...state, signOutPending: action.value }
    case 'signin/needed':
      return { ...state, needsSignIn: action.value }
    case 'error':
      return { ...state, actionError: action.value }
    case 'moderation/pending':
      return {
        ...state,
        pendingModeration: { ...state.pendingModeration, [action.id]: action.value },
      }
    case 'lock/pending':
      return { ...state, lockPending: action.value }
    case 'posting/set':
      return { ...state, posting: action.value }
    default:
      throw new Error(`Unknown UI action: ${JSON.stringify(action)}`)
  }
}

// A vote or a reaction result for one row. Both live in one patch, so either can arrive first.
export type VotePatch = Record<string, { score?: number; viewerVote?: VoteValue | null; reactions?: ReactionSummary[] }>

// Vote and reaction results overlay the row cache: untouched rows keep their object, so
// their cached markdown/date reuse on the next repaint.
export function applyVotes(comments: Comment[], votes: VotePatch): Comment[] {
  if (Object.keys(votes).length === 0) return comments
  let changed = false
  const next = comments.map((comment) => {
    const patch = votes[comment.id]
    if (!patch) return comment
    changed = true
    return { ...comment, ...patch }
  })
  return changed ? next : comments
}
