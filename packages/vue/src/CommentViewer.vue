<script setup lang="ts">
import { useTheme } from './lib/useTheme'
import {
  beginOAuthSignIn,
  describeError,
  type ErrorInfo,
  fetchCommentSettings,
  fetchViewerSession,
  gateFor,
  loadThreadWindow,
  resolveSettings,
  safeUrl,
  signInRequired,
  sortCommentRoots,
  themeVarsToStyle,
  type ThreadSort,
} from '@last-comments-widgets/client'
import { computed, ref, useTemplateRef, watch } from 'vue'
import CommentError from './CommentError.vue'
import CommentList from './CommentList.vue'
import CommentSkeleton from './CommentSkeleton.vue'
import CommentsPager from './CommentsPager.vue'
import SignInPrompt from './SignInPrompt.vue'
import ThreadGuides from './ThreadGuides.vue'
import ThreadSortToggle from './ThreadSortToggle.vue'
import { threadSignature } from './lib/useGuides'
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
  transform: (nodes) => sortCommentRoots(nodes, sort.value),
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
const sort = ref<ThreadSort>('newest')

function handleSortChange(next: ThreadSort) {
  sort.value = next
  // Window boundaries follow the new order, so start from its first page.
  page.value = 1
}

function noop(): void {}
function noopAsync(): Promise<void> {
  return Promise.resolve()
}
function noopEdit(): Promise<null> {
  return Promise.resolve(null)
}

// The site's policy and the visitor's session. A private site's thread waits for both.
const policy = ref<ReturnType<typeof resolveSettings> | null>(null)
const viewerSignedIn = ref<boolean | null>(null)
const signInError = ref<ErrorInfo | null>(null)
// Derived: the read gate once both have settled. Null while either is pending.
const readGate = computed(() =>
  policy.value && viewerSignedIn.value !== null ? gateFor(policy.value.access, 'read', viewerSignedIn.value) : null,
)
const signInHref = computed(() => safeUrl(props.signInUrl))

// Reads the policy and the session, then loads the first window only if the read gate allows it.
async function startViewer() {
  const [settings, session] = await Promise.all([
    fetchCommentSettings({ baseUrl: props.baseUrl, site: props.site, fetchImpl: props.fetchImpl }),
    fetchViewerSession({ baseUrl: props.baseUrl, fetchImpl: props.fetchImpl }).catch(() => null),
  ])
  policy.value = resolveSettings({}, undefined, settings)
  viewerSignedIn.value = session !== null
  if (readGate.value === 'allow') await loadFirstPage()
}

// The sign-in button mirrors the Comments widget: a configured sign-in page, else the OAuth flow.
async function startSignIn() {
  signInError.value = null
  try {
    window.location.assign(
      await beginOAuthSignIn({
        baseUrl: props.baseUrl,
        pageUrl: props.pageUrl ?? window.location.href,
        fetchImpl: props.fetchImpl,
      }),
    )
  } catch (err) {
    signInError.value = describeError(err)
  }
}

const rootEl = useTemplateRef<HTMLElement>('rootEl')
const listEl = useTemplateRef<HTMLElement>('listEl')
const { started } = useLazyLoad(
  rootEl,
  () => props.lazy,
  () => void startViewer(),
)

watch(
  () => [props.site, props.baseUrl, props.pageUrl, props.limit, props.fetchImpl],
  () => {
    if (started.value) void startViewer()
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
    <template v-if="readGate === 'sign-in'">
      <SignInPrompt :info="signInRequired('read')" context="read" :sign-in-href="signInHref" @sign-in="startSignIn" />
      <CommentError v-if="signInError" :info="signInError" />
    </template>
    <template v-else>
      <ThreadSortToggle v-if="status !== 'error' && roots.length > 0" :value="sort" :on-change="handleSortChange" />
      <div v-if="status === 'loading'" class="grid gap-3">
        <CommentSkeleton :count="3" read-only />
      </div>
      <CommentError v-else-if="errorInfo" :info="errorInfo" @retry="loadFirstPage" />
      <p v-else-if="pageRoots.length === 0 && !loadingPage" class="text-sm text-muted-foreground">No comments yet.</p>
      <template v-else>
        <section ref="listEl" aria-label="Comments" class="lc-thread-guides relative grid grid-cols-1 gap-3">
          <ThreadGuides :key="`${page}:${sort}:${threadSignature(pageRoots)}`" :list-el="listEl" />
          <CommentList
            v-if="pageRoots.length > 0"
            :nodes="pageRoots"
            :depth="0"
            :read-only="true"
            :math="props.math"
            :mermaid="props.mermaid"
            :code-highlight="props.codeHighlight"
            :on-vote="noop"
            :on-reply="noop"
            :on-edit="noopEdit"
            :on-delete="noopAsync"
          />
        </section>
        <div v-if="loadingPage" class="grid gap-3">
          <CommentSkeleton :count="2" read-only />
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
    </template>
    <footer class="lc-footer mt-2 text-right text-xs text-muted-foreground">
      Powered by
      <a
        class="underline underline-offset-4 hover:text-foreground"
        href="https://github.com/lst97-oss/last-comments"
        target="_blank"
        rel="noreferrer"
        >last-comments</a
      >
    </footer>
  </section>
</template>
