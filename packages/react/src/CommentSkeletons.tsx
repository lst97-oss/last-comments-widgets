import { memo } from 'react'
import { Skeleton } from './ui/skeleton'

// shortcut: fixed keys cap the block at 3 rows (initial load); page fetches render 2.
const SKELETON_ROWS = ['row-1', 'row-2', 'row-3']
const NAME_WIDTHS = ['w-24', 'w-32', 'w-20']
const BODY_WIDTHS = ['w-3/4', 'w-2/3', 'w-4/5']

// Placeholder geometry shared by initial loads (3 rows) and page fetches (2).
// The viewer variant drops the interactive slots the real read-only row never
// renders (menu, vote buttons, Reply) and keeps the right-aligned score.
export const CommentSkeletons = memo(function CommentSkeletons({
  count,
  readOnly = false,
}: {
  count: number
  readOnly?: boolean
}) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading comments…</span>
      <div className={readOnly ? 'grid gap-4' : 'grid gap-3'} aria-hidden="true">
        {SKELETON_ROWS.slice(0, count).map((key, index) => (
          <div key={key} className="lc-comment-skeleton" data-lc-skeleton="">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Skeleton className="size-6 rounded-md" />
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className={`h-4 ${NAME_WIDTHS[index]}`} />
              <Skeleton className="h-3 w-10" />
              {readOnly ? (
                <Skeleton className="ml-auto h-4 w-6" />
              ) : (
                <>
                  <Skeleton className="ml-auto size-6 rounded-md" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </>
              )}
            </div>
            <div className="my-3 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className={`h-4 ${BODY_WIDTHS[index]}`} />
            </div>
            {!readOnly && <Skeleton className="h-7 w-16 rounded-md" />}
          </div>
        ))}
      </div>
    </div>
  )
})
