<script setup lang="ts">
import { DEFAULT_BODY_LIMIT, describeError, type ErrorInfo, renderMarkdown } from '@last-comments-widgets/client'
import { Bold, CodeXml, Eye, Italic, Link2, List, ListOrdered, PenLine, Quote } from 'lucide-vue-next'
import { computed, nextTick, ref, useId, useTemplateRef } from 'vue'
import VueTurnstile from 'vue-turnstile'
import CommentError from './CommentError.vue'

const props = defineProps<{
  siteKey?: string
  dark?: boolean
  guest?: boolean
  sessionPending?: boolean
  parentId: string | null
  initialBody?: string
  submitLabel?: string
  errorTitle?: string
  signInHref?: string
  onSignIn?: () => void
  // Max body characters, counted before trimming to match the server routes.
  bodyLimit?: number
  // Held by the owner while the request is in flight.
  pending?: boolean
  // Error owned by the owner (the reply slot keeps its draft on failure).
  error?: ErrorInfo | null
  // Return `false` when the send failed: the form keeps the draft for a retry.
  onSubmit: (input: { authorName: string; bodyMarkdown: string; verificationToken?: string }) => Promise<boolean | void>
  onCancelReply?: () => void
}>()

const emit = defineEmits<{ submitted: [] }>()

defineOptions({ name: 'CommentForm' })

const authorName = ref('')
const body = ref(props.initialBody ?? '')
const token = ref('')
const preview = ref(false)
const turnstile = useTemplateRef<{ reset: () => void }>('turnstile')
const busy = ref(false)
const formError = ref<ErrorInfo | null>(null)
const textareaEl = useTemplateRef<HTMLTextAreaElement>('textareaEl')
const counterId = useId()
const showName = computed(() => props.guest ?? true)
const bodyLimit = computed(() => props.bodyLimit ?? DEFAULT_BODY_LIMIT)
// Counts what the author typed: the server caps the same raw length.
const bodyTooLong = computed(() => body.value.length > bodyLimit.value)
const pending = computed(() => busy.value || Boolean(props.pending))
const submitDisabled = computed(
  () =>
    pending.value ||
    bodyTooLong.value ||
    // Posting before the identity resolves would guess "guest" and send the wrong wire flag.
    Boolean(props.sessionPending) ||
    (showName.value && props.siteKey ? !token.value : false),
)

const iconBtn =
  'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none select-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4'

// Wraps or prefixes the selection: the transform returns the inserted text and
// where the caret ends up relative to it.
function applyToSelection(
  transform: (selected: string) => { text: string; anchor: number; head: number },
  placeholder = 'text',
) {
  const el = textareaEl.value
  if (!el) return
  const start = el.selectionStart ?? body.value.length
  const end = el.selectionEnd ?? body.value.length
  const selected = body.value.slice(start, end) || placeholder
  const { text, anchor, head } = transform(selected)
  body.value = `${body.value.slice(0, start)}${text}${body.value.slice(end)}`
  void nextTick(() => {
    el.focus()
    el.setSelectionRange(start + anchor, start + head)
  })
}

function wrapSelection(before: string, after: string, placeholder = 'text') {
  applyToSelection((selected) => {
    const text = `${before}${selected}${after}`
    return { text, anchor: text.length, head: text.length }
  }, placeholder)
}

function wrapLine(prefix: string, placeholder = 'text') {
  applyToSelection((selected) => {
    const lines = selected.split('\n')
    return {
      text: `${prefix}${lines.join(`\n${prefix}`)}`,
      anchor: prefix.length,
      head: prefix.length + selected.length + prefix.length * lines.length,
    }
  }, placeholder)
}

const tools = [
  { label: 'Bold', icon: Bold, run: () => wrapSelection('**', '**', 'bold') },
  { label: 'Italic', icon: Italic, run: () => wrapSelection('*', '*', 'italic') },
  { label: 'Quote', icon: Quote, run: () => wrapLine('> ', 'quote') },
  { label: 'Code', icon: CodeXml, run: () => wrapSelection('`', '`', 'code') },
  { label: 'Link', icon: Link2, run: () => wrapSelection('[', '](url)', 'link') },
  { label: 'Bullet list', icon: List, run: () => wrapLine('- ', 'item') },
  { label: 'Numbered list', icon: ListOrdered, run: () => wrapLine('1. ', 'item') },
]

const previewHtml = computed(
  () => renderMarkdown(body.value) || '<p class="text-muted-foreground">Nothing to preview.</p>',
)

async function submit() {
  if (pending.value) return
  // The submit button is already disabled; keep the guard so a stale render can
  // never post a body the server would reject with a validation error.
  if (bodyTooLong.value) return
  busy.value = true
  formError.value = null
  try {
    const result = await props.onSubmit({
      // Guests post under the name they typed, or "Anonymous" when they left it blank.
      authorName: showName.value ? authorName.value.trim() || 'Anonymous' : '',
      bodyMarkdown: body.value,
      ...(props.siteKey && token.value ? { verificationToken: token.value } : {}),
    })
    // `false` = the send failed: keep the draft so it can be retried.
    if (result === false) return
    body.value = ''
    token.value = ''
    preview.value = false
    turnstile.value?.reset()
    emit('submitted')
  } catch (err) {
    formError.value = describeError(err, { title: props.errorTitle ?? "Your comment wasn't posted" })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="lc-composer rounded-xl border border-border p-3" @submit.prevent="submit">
    <div v-if="props.parentId" class="mb-2 flex items-center justify-between text-xs text-muted-foreground">
      <span>Replying to this comment</span>
      <button
        v-if="props.onCancelReply"
        type="button"
        class="inline-flex h-7 items-center justify-center rounded-md px-2 text-xs font-medium transition-colors hover:bg-muted hover:text-foreground"
        @click="props.onCancelReply()"
      >
        Cancel
      </button>
    </div>
    <div class="mb-1 flex flex-wrap items-center justify-end gap-0.5">
      <div class="mr-auto flex gap-0.5">
        <button
          type="button"
          class="inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors"
          :class="
            preview
              ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
              : 'bg-secondary text-secondary-foreground'
          "
          :aria-pressed="!preview"
          @click="preview = false"
        >
          <PenLine class="size-3.5" /> Write
        </button>
        <button
          type="button"
          class="inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors"
          :class="
            preview
              ? 'bg-secondary text-secondary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          "
          :aria-pressed="preview"
          @click="preview = true"
        >
          <Eye class="size-3.5" /> Preview
        </button>
      </div>
      <div class="flex gap-0.5" role="toolbar" aria-label="Markdown formatting">
        <button
          v-for="tool in tools"
          :key="tool.label"
          type="button"
          :class="iconBtn"
          :title="tool.label"
          :aria-label="tool.label"
          @click="tool.run()"
        >
          <component :is="tool.icon" />
        </button>
      </div>
    </div>
    <!-- eslint-disable vue/no-v-html -- renderMarkdown strips raw HTML and restricts link protocols. -->
    <div
      v-if="preview"
      class="lc-markdown min-h-24 px-1 py-2 font-sans text-sm [overflow-wrap:anywhere]"
      v-html="previewHtml"
    />
    <!-- eslint-enable vue/no-v-html -->
    <textarea
      v-else
      ref="textareaEl"
      v-model="body"
      name="bodyMarkdown"
      :placeholder="props.parentId ? 'Write a reply…' : 'Your comment here…'"
      rows="4"
      required
      :aria-label="props.parentId ? 'Reply body' : 'Comment body'"
      :aria-describedby="counterId"
      :aria-invalid="bodyTooLong || undefined"
      class="flex min-h-24 w-full bg-transparent px-1 py-2 font-sans text-sm outline-none placeholder:text-muted-foreground"
    />
    <p :id="counterId" data-lc-char-count class="mt-1 text-right text-xs text-muted-foreground tabular-nums">
      <span :class="bodyTooLong ? 'text-destructive' : undefined">{{ body.length.toLocaleString() }}</span>
      <span> / {{ bodyLimit.toLocaleString() }}</span>
    </p>
    <VueTurnstile
      v-if="props.siteKey"
      ref="turnstile"
      v-model="token"
      :site-key="props.siteKey"
      :theme="props.dark ? 'dark' : 'light'"
    />
    <CommentError
      v-if="props.error ?? formError"
      class="mt-2"
      :info="props.error ?? formError!"
      :sign-in-href="props.signInHref"
      @retry="submit"
      @sign-in="props.onSignIn?.()"
    />
    <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
      <slot name="signIn" />
      <input
        v-if="showName"
        v-model="authorName"
        type="text"
        name="authorName"
        placeholder="Anonymous"
        autocomplete="nickname"
        maxlength="80"
        aria-label="Your name"
        class="h-8 w-32 min-w-0 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground sm:w-40"
      />
      <p class="ml-auto hidden text-xs text-muted-foreground sm:block">
        Styling with <span class="font-medium text-primary">Markdown</span> is supported
      </p>
      <button
        type="submit"
        :disabled="submitDisabled"
        class="ml-auto inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium whitespace-nowrap text-primary-foreground transition-colors outline-none select-none hover:bg-primary/80 disabled:pointer-events-none disabled:opacity-50"
      >
        {{ pending ? 'Posting…' : (props.submitLabel ?? (props.parentId ? 'Post reply' : 'Post comment')) }}
      </button>
    </div>
  </form>
</template>
