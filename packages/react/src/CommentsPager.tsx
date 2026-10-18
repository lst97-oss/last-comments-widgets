import { Button } from './ui/button'

// Thread-window pager shared by the list widget and the read-only viewer: one
// page is `limit` threads, the API has no total, so there are no page numbers.
export function CommentsPager({
  page,
  limit,
  threads,
  hasMore,
  loading,
  onPrev,
  onNext,
}: {
  page: number
  limit: number
  threads: number
  hasMore: boolean
  loading: boolean
  onPrev: () => void
  onNext: () => void
}) {
  // The third term matters: after paging to the end and back, `hasMore` is
  // false while later pages are loaded and must stay reachable.
  if (page <= 1 && !hasMore && threads <= limit) return null
  return (
    <nav aria-label="Comments pagination" className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <Button variant="outline" size="sm" disabled={page === 1 || loading} onClick={onPrev}>
        <span aria-hidden="true">&lsaquo;</span> Previous
      </Button>
      <span className="text-muted-foreground">
        Page{' '}
        <span aria-current="page" className="font-medium text-foreground">
          {page}
        </span>
      </span>
      <Button variant="outline" size="sm" disabled={loading || (threads <= page * limit && !hasMore)} onClick={onNext}>
        Next <span aria-hidden="true">&rsaquo;</span>
      </Button>
    </nav>
  )
}
