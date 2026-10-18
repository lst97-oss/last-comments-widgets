import { Skeleton } from './ui/skeleton'

// shortcut: fixed keys cap the block at 3 cards (initial load); page fetches render 2.
const SKELETON_CARDS = ['card-1', 'card-2', 'card-3']

// Placeholder card geometry shared by initial loads (3 cards) and page fetches (2).
export function CommentSkeletons({ count }: { count: number }) {
  return (
    <div role="status" aria-busy="true" className="grid gap-3">
      <span className="sr-only">Loading comments…</span>
      <div className="grid gap-3" aria-hidden="true">
        {SKELETON_CARDS.slice(0, count).map((key) => (
          <div key={key} className="rounded-lg border border-border p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="mt-3 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
            <div className="mt-3 flex gap-2">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
