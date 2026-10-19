import {
  DEFAULT_EDIT_WINDOW_MINUTES,
  isEditWindowOpen,
  type ThreadNode,
  type ViewerOptions,
  type ViewerRole,
  type VoteValue,
  type WidgetTheme,
} from '@last-comments-widgets/client'

export { canModerate } from '@last-comments-widgets/client'

export type Theme = 'light' | 'dark' | 'system'

export type CommentsProps = {
  site: string
  baseUrl: string
  pageUrl?: string
  // Host-known thread id: moderator mode then addresses this page directly
  // instead of matching `pageUrl` against the site's (capped) page list.
  pageId?: string
  turnstileSiteKey?: string
  limit?: number
  theme?: Theme
  themeVars?: WidgetTheme
  signInUrl?: string
  viewerUserId?: string
  viewerRole?: ViewerRole
  editWindowMinutes?: number
  // Embed below the fold: hold the first fetch until the widget nears the viewport.
  lazy?: boolean
  fetchImpl?: typeof fetch
}

export type CommentViewerProps = ViewerOptions & {
  // Embed below the fold: hold the first fetch until the viewer nears the viewport.
  lazy?: boolean
}

export type Commentupdater = (id: string, patch: { score?: number; viewerVote?: VoteValue | null }) => void

export function resolvePageUrl(explicit: string | undefined): string {
  if (explicit) return explicit
  if (typeof window !== 'undefined') return window.location.href
  throw new Error('pageUrl is required outside the browser')
}

export function canShowEdit(
  viewerUserId: string | undefined,
  comment: { userId?: string | null; createdAt: string },
  editWindowMinutes: number = DEFAULT_EDIT_WINDOW_MINUTES,
  nowMs: number = Date.now(),
): boolean {
  if (viewerUserId == null || comment.userId == null || viewerUserId !== comment.userId) return false
  return isEditWindowOpen(comment.createdAt, nowMs, editWindowMinutes)
}

export function toggleVoteValue(current: VoteValue | null, next: VoteValue): 'clear' | VoteValue {
  return current === next ? 'clear' : next
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
