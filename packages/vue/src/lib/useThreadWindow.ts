import { computed, ref, shallowRef } from 'vue'
import { buildCommentTree, type Comment, type ErrorInfo, type ThreadNode } from '@last-comments-widgets/client'

export type ThreadWindowLoad = {
  reset: boolean
  pages: number
  existing: Comment[]
}

export type ThreadWindowFailure<S extends string> = { status: S; info: ErrorInfo }

// Thread-window state shared by the composer and the read-only viewer: rows are
// the cache, a page is a window over roots (replies consume rows, so a raw row
// page would split threads).
export function useThreadWindow<S extends string = 'error'>(config: {
  limit: () => number
  load: (input: ThreadWindowLoad) => Promise<{ comments: Comment[]; hasMore: boolean }>
  failure: (error: unknown) => ThreadWindowFailure<S>
  // Overlays (pending votes) merge here so the cached base tree stays intact.
  transform?: (nodes: ThreadNode[]) => ThreadNode[]
  onBeforeLoad?: (reset: boolean) => void
  onLoaded?: (reset: boolean) => void
}) {
  const rows = shallowRef<Comment[]>([])
  const page = ref(1)
  const hasMore = ref(true)
  const loadingPage = ref(false)
  const status = ref<'loading' | 'ready' | S>('loading')
  const errorInfo = ref<ErrorInfo | null>(null)
  // Bumped on every load: a response that lost the race never commits.
  let loadSeq = 0

  const limit = computed(config.limit)
  // A page is a window over threads, not rows: the API stream is flat and replies
  // can land on a later row than their parent, so a raw page slice would render
  // those replies as phantom top-level comments.
  const baseRoots = computed<ThreadNode[]>(() => buildCommentTree(rows.value))
  const roots = computed<ThreadNode[]>(() => (config.transform ? config.transform(baseRoots.value) : baseRoots.value))
  const pageRoots = computed(() => roots.value.slice((page.value - 1) * limit.value, page.value * limit.value))
  const nextDisabled = computed(() => roots.value.length <= page.value * limit.value && !hasMore.value)

  async function load(reset: boolean, pages = 1): Promise<boolean> {
    const seq = ++loadSeq
    if (reset) {
      status.value = 'loading'
      page.value = 1
    }
    errorInfo.value = null
    config.onBeforeLoad?.(reset)
    try {
      const result = await config.load({ reset, pages, existing: rows.value })
      if (seq !== loadSeq) return false
      rows.value = result.comments
      hasMore.value = result.hasMore
      status.value = 'ready'
      config.onLoaded?.(reset)
      return true
    } catch (err) {
      if (seq !== loadSeq) return false
      const failure = config.failure(err)
      status.value = failure.status
      errorInfo.value = failure.info
      return false
    }
  }

  async function loadFirstPage() {
    await load(true)
  }

  async function nextPage() {
    if (loadingPage.value || nextDisabled.value) return
    loadingPage.value = true
    try {
      // Fill the destination window before advancing (cache hit for Prev).
      if (!(await load(false, page.value + 1))) return
      if (roots.value.length > page.value * limit.value) page.value += 1
    } finally {
      loadingPage.value = false
    }
  }

  function previousPage() {
    if (page.value > 1) page.value -= 1
  }

  return {
    rows,
    page,
    hasMore,
    loadingPage,
    status,
    errorInfo,
    limit,
    roots,
    pageRoots,
    nextDisabled,
    load,
    loadFirstPage,
    nextPage,
    previousPage,
  }
}
