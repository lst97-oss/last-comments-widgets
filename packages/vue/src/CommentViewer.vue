<script setup lang="ts">
import { useTheme } from './lib/useTheme'
import { describeError, loadThreadWindow, themeVarsToStyle } from '@last-comments-widgets/client'
import { computed, useTemplateRef, watch } from 'vue'
import CommentError from './CommentError.vue'
import CommentList from './CommentList.vue'
import CommentSkeleton from './CommentSkeleton.vue'
import CommentsPager from './CommentsPager.vue'
import { useLazyLoad } from './lib/useLazyLoad'
import { useThreadWindow } from './lib/useThreadWindow'
import type { CommentViewerProps } from './types'

const props = withDefaults(defineProps<CommentViewerProps>(), { limit: 20, theme: 'system', lazy: false })

defineOptions({ name: 'CommentViewer' })

// Same thread-window model as the list widget: rows are the cache, a page is a
// window over roots. Replies consume rows, so one `limit`-row fetch yields fewer
// than `limit` threads and a raw row page would render split off orphans.
const {
  page,
  hasMore,
  loadingPage,
  status,
  errorInfo,
  limit,
  roots,
  pageRoots,
  nextDisabled,
  loadFirstPage,
  nextPage,
  previousPage,
} = useThreadWindow({
  limit: () => props.limit ?? 20,
  load: async ({ reset, pages, existing }) => {
    const result = await loadThreadWindow({
      site: props.site,
      baseUrl: props.baseUrl,
      pageUrl: props.pageUrl,
      limit: props.limit ?? 20,
      pages: reset ? 1 : pages,
      ...(reset ? {} : { existing }),
      ...(props.fetchImpl ? { fetchImpl: props.fetchImpl } : {}),
    })
    return { comments: result.comments, hasMore: result.hasMore }
  },
  failure: (err) => ({ status: 'error' as const, info: describeError(err) }),
})

const dark = useTheme(() => props.theme)
const rootStyle = computed(() => themeVarsToStyle(props.themeVars, dark.value))

function noop(): void {}
function noopAsync(): Promise<void> {
  return Promise.resolve()
}

const rootEl = useTemplateRef<HTMLElement>('rootEl')
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
      <CommentsPager
        :page="page"
        :limit="limit"
        :threads="roots.length"
        :has-more="hasMore"
        :next-disabled="nextDisabled"
        :loading="loadingPage"
        @prev="previousPage"
        @next="nextPage"
      />
    </template>
  </section>
</template>
