import {
  DEFAULT_EDIT_WINDOW_MINUTES,
  isEditWindowOpen,
  type ThreadNode,
  type ViewerRole,
  type VoteValue,
  type WidgetTheme,
} from '@last-comments-widgets/client'

export { canModerate } from '@last-comments-widgets/client'

export type Theme = 'light' | 'dark' | 'system'

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
  editWindowMinutes?: number
  themeVars?: WidgetTheme
  fetchImpl?: typeof fetch
}

export function resolvePageUrl(explicit: string | undefined): string {
  if (explicit) return explicit
  if (typeof window !== 'undefined') return window.location.href
  throw new Error('pageUrl is required outside the browser')
}

// Delete stays ownership-only (no window); edit also requires the window.
export function canEditComment(
  comment: { userId: string | null; createdAt: string },
  viewerUserId: string | undefined,
  editWindowMinutes: number = DEFAULT_EDIT_WINDOW_MINUTES,
): boolean {
  return (
    !!viewerUserId &&
    !!comment.userId &&
    viewerUserId === comment.userId &&
    isEditWindowOpen(comment.createdAt, Date.now(), editWindowMinutes)
  )
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
