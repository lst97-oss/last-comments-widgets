import {
  EDIT_WINDOW_CLOSED,
  isEditWindowOpen,
  resolveEditWindow,
  type ThreadNode,
  type ViewerRole,
  type VoteValue,
  type WidgetTheme,
} from '@last-comments-widgets/client'

export { canModerate } from '@last-comments-widgets/client'

export type Theme = 'light' | 'dark' | 'system'

// Comment action rendering: icon only, icon plus label, or label only.
export type ActionMode = 'icon' | 'icon-text' | 'text'

export type CommentsOptions = {
  site: string
  baseUrl: string
  pageUrl?: string
  turnstileSiteKey?: string
  limit?: number
  theme?: Theme
  signInUrl?: string
  viewerUserId?: string
  viewerRole?: ViewerRole
  // Guest-authored comments may be edited for this many minutes from this
  // browser (default 10; 0 = unlimited). Signed-in authors have no window.
  anonEditWindowMinutes?: number
  // Reply/Edit/Delete (and moderator) action rendering, default 'icon-text'.
  actionMode?: ActionMode
  // Max body characters, counted before trimming to match the server routes.
  bodyLimit?: number
  themeVars?: WidgetTheme
  fetchImpl?: typeof fetch
}

export function resolvePageUrl(explicit: string | undefined): string {
  if (explicit) return explicit
  if (typeof window !== 'undefined') return window.location.href
  throw new Error('pageUrl is required outside the browser')
}

export type EditGateOptions = {
  // Window for guest-authored comments; signed-in owners have no window.
  anonWindowMinutes?: number
  // A guest owns the comment only while this browser still holds its edit key.
  hasEditKey?: boolean
}

// Signed-in authors edit any time; guest authors only inside the anonymous
// window while this browser still holds the key issued at creation.
export function canEditComment(
  comment: { userId?: string | null; createdAt: string },
  viewerUserId?: string,
  options: EditGateOptions = {},
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

export type VoteOverlay = Record<string, { score: number; viewerVote: VoteValue | null }>

// Applies pending vote results to a built tree without rebuilding it. Untouched
// nodes keep their identity, so only the voted row (and its ancestors' child
// arrays) re-renders; an empty overlay returns the input array unchanged.
export function applyVoteOverlay(nodes: ThreadNode[], overlay: VoteOverlay): ThreadNode[] {
  if (Object.keys(overlay).length === 0) return nodes
  let changed = false
  const apply = (node: ThreadNode): ThreadNode => {
    const patch = overlay[node.comment.id]
    const children = node.children.map(apply)
    const childrenChanged = children.some((child, index) => child !== node.children[index])
    if (!patch) return childrenChanged ? { ...node, children } : node
    changed = true
    return {
      comment: { ...node.comment, score: patch.score, viewerVote: patch.viewerVote },
      children: childrenChanged ? children : node.children,
    }
  }
  const result = nodes.map(apply)
  return changed ? result : nodes
}
