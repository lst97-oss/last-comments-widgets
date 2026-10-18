<script setup lang="ts">
import { useTheme } from './lib/useTheme'
import {
  buildCommentTree,
  type Comment,
  describeError,
  type ErrorInfo,
  loadThreadWindow,
  type ThreadNode,
  themeVarsToStyle,
} from '@last-comments/client'
import { computed, ref, watch } from 'vue'
import CommentError from './CommentError.vue'
import CommentList from './CommentList.vue'
import CommentSkeleton from './CommentSkeleton.vue'
import { useLazyLoad } from './lib/useLazyLoad'
import type { CommentViewerProps } from './types'

const props = withDefaults(defineProps<CommentViewerProps>(), { limit: 20, theme: 'system', lazy: false })

defineOptions({ name: 'CommentViewer' })

type Status = 'loading' | 'ready' | 'error'

// Same thread-window model as the list widget: rows are the cache, a page is a
// window over roots. Replies consume rows, so one `limit`-row fetch yields fewer
// than `limit` threads and a raw row page would render split off orphans.
const rows = ref<Comment[]>([])
const page = ref(1)
const hasMore = ref(true)
const loadingPage = ref(false)
const status = ref<Status>('loading')
const errorInfo = ref<ErrorInfo | null>(null)
const dark = useTheme(() => props.theme)

const limit = computed(() => props.limit ?? 20)
const roots = computed<ThreadNode[]>(() => buildCommentTree(rows.value))
const pageRoots = computed(() => roots.value.slice((page.value - 1) * limit.value, page.value * limit.value))
const nextDisabled = computed(() => roots.value.length <= page.value * limit.value && !hasMore.value)

const rootStyle = computed(() => themeVarsToStyle(props.themeVars, dark.value))

async function load(reset: boolean, pages = 1): Promise<boolean> {
  if (reset) {
    status.value = 'loading'
    page.value = 1
  }
  errorInfo.value = null
  try {
    const result = await loadThreadWindow({
      site: props.site,
      baseUrl: props.baseUrl,
      pageUrl: props.pageUrl,
      limit: limit.value,
      pages: reset ? 1 : pages,
      ...(reset ? {} : { existing: rows.value }),
      ...(props.fetchImpl ? { fetchImpl: props.fetchImpl } : {}),
    })
    rows.value = result.comments
    hasMore.value = result.hasMore
    status.value = 'ready'
    return true
  } catch (err) {
    errorInfo.value = describeError(err)
    status.value = 'error'
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

function noop(): void {}
function noopAsync(): Promise<void> {
  return Promise.resolve()
}

const rootEl = ref<HTMLElement | null>(null)
const { started } = useLazyLoad(
  rootEl,
  () => props.lazy,
  () => void loadFirstPage(),
)

watch(
  () => [props.site, props.baseUrl, props.pageUrl, props.limit, props.fetchImpl],
  () => {
    if (started.value) void loadFirstPage()
  },
)
</script>

<template>
  <section
    ref="rootEl"
    class="lc-comments grid gap-4"
    :class="dark ? 'dark' : ''"
    :style="rootStyle"
    aria-label="Comments"
  >
    <div v-if="status === 'loading'" class="grid gap-3">
      <CommentSkeleton :count="3" />
    </div>
    <CommentError v-else-if="errorInfo" :info="errorInfo" @retry="loadFirstPage" />
    <p v-else-if="pageRoots.length === 0 && !loadingPage" class="text-sm text-muted-foreground">No comments yet.</p>
    <template v-else>
      <section aria-label="Comments" class="grid gap-4">
        <CommentList
          v-if="pageRoots.length > 0"
          :nodes="pageRoots"
          :depth="0"
          :read-only="true"
          :on-vote="noop"
          :on-reply="noop"
          :on-edit="noopAsync"
          :on-delete="noopAsync"
        />
      </section>
      <div v-if="loadingPage" class="grid gap-3">
        <CommentSkeleton :count="2" />
      </div>
      <!-- `roots.length > limit`: after Prev to page 1 at the end of the stream
           hasMore is false, yet later pages are loaded and must stay reachable. -->
      <nav
        v-if="page > 1 || hasMore || roots.length > limit"
        aria-label="Comments pagination"
        class="flex flex-wrap items-center justify-between gap-2 text-sm"
      >
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
          :disabled="page === 1 || loadingPage"
          @click="previousPage"
        >
          <span aria-hidden="true">&lsaquo;</span> Previous
        </button>
        <span class="text-muted-foreground">
          Page <span aria-current="page" class="font-medium text-foreground">{{ page }}</span>
        </span>
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
          :disabled="nextDisabled || loadingPage"
          @click="nextPage"
        >
          Next <span aria-hidden="true">&rsaquo;</span>
        </button>
      </nav>
    </template>
  </section>
</template>
