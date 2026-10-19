import type { ErrorInfo } from '@last-comments-widgets/client'

// One row owns three mutually-exclusive UI slots (editor, reply composer, body)
// plus their pending/error flags, so those transitions live in one reducer
// instead of six independent setters.
export type ItemState = {
  editing: boolean
  saving: boolean
  editError: ErrorInfo | null
  replying: boolean
  replyError: ErrorInfo | null
  collapsedOverride: boolean | null
}

export type ItemAction =
  | { type: 'edit/open' }
  | { type: 'edit/close' }
  | { type: 'edit/settle'; error: ErrorInfo | null }
  | { type: 'saving/set'; saving: boolean }
  | { type: 'reply/submit' }
  | { type: 'reply/settle'; error: ErrorInfo | null }
  | { type: 'replying/set'; replying: boolean }
  | { type: 'collapse/toggle'; value: boolean }

export const ITEM_INITIAL: ItemState = {
  editing: false,
  saving: false,
  editError: null,
  replying: false,
  replyError: null,
  collapsedOverride: null,
}

export function itemReducer(state: ItemState, action: ItemAction): ItemState {
  switch (action.type) {
    case 'edit/open':
      return { ...state, editing: true }
    case 'edit/close':
      return { ...state, editing: false, editError: null }
    // A failed save keeps the editor (and its draft) open; Cancel is the way out.
    case 'edit/settle':
      return { ...state, editError: action.error, editing: action.error === null ? false : state.editing }
    case 'saving/set':
      return { ...state, saving: action.saving }
    case 'reply/submit':
      return { ...state, replying: true }
    case 'reply/settle':
      return { ...state, replyError: action.error }
    case 'replying/set':
      return { ...state, replying: action.replying }
    case 'collapse/toggle':
      return { ...state, collapsedOverride: action.value }
    default:
      throw new Error(`Unknown comment item action: ${JSON.stringify(action)}`)
  }
}
