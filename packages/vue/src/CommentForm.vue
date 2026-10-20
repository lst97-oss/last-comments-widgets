<script setup lang="ts">
import { DEFAULT_BODY_LIMIT, describeError, type ErrorInfo, renderMarkdown } from '@last-comments-widgets/client'
import { Bold, CodeXml, Eye, Italic, Link2, List, ListOrdered, PenLine, Quote } from '@lucide/vue'
import { computed, nextTick, ref, useId, useTemplateRef } from 'vue'
import CommentError from './CommentError.vue'
import Turnstile from './Turnstile.vue'
import { buttonClass } from './lib/button'
import { cn } from './lib/cn'
import type { TurnstileOptions } from './lib/turnstile'

const props = defineProps<{
  siteKey?: string
  dark?: boolean
  // Cloudflare's supported design knobs for the guest challenge.
  turnstileOptions?: TurnstileOptions
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

// The `Textarea` / `Input` primitives plus the composer's call-site override.
const TEXTAREA_CLASS = cn(
  'flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
  'border-0 bg-transparent px-1 focus-visible:ring-0',
)
const INPUT_CLASS = cn(
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
  'w-32 min-w-0 border-0 bg-transparent px-1 focus-visible:ring-0 sm:w-40',
)

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
        :class="buttonClass('ghost', 'sm')"
        @click="props.onCancelReply()"
      >
        Cancel
      </button>
    </div>
    <div class="mb-1 flex flex-wrap items-center justify-end gap-0.5">
      <div class="mr-auto flex gap-0.5">
        <button
          type="button"
          :class="buttonClass(preview ? 'ghost' : 'secondary', 'sm')"
          :aria-pressed="!preview"
          @click="preview = false"
        >
          <PenLine /> Write
        </button>
        <button
          type="button"
          :class="buttonClass(preview ? 'secondary' : 'ghost', 'sm')"
          :aria-pressed="preview"
          @click="preview = true"
        >
          <Eye /> Preview
        </button>
      </div>
      <div class="flex gap-0.5" role="toolbar" aria-label="Markdown formatting">
        <button
          v-for="tool in tools"
          :key="tool.label"
          type="button"
          :class="buttonClass('ghost', 'icon-sm')"
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
      :class="TEXTAREA_CLASS"
    />
    <p :id="counterId" data-lc-char-count class="mt-1 text-right text-xs text-muted-foreground tabular-nums">
      <span :class="bodyTooLong ? 'text-destructive' : undefined">{{ body.length.toLocaleString() }}</span>
      <span> / {{ bodyLimit.toLocaleString() }}</span>
    </p>
    <Turnstile
      v-if="props.siteKey"
      ref="turnstile"
      v-model="token"
      :site-key="props.siteKey"
      :dark="props.dark"
      :turnstile-options="props.turnstileOptions"
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
        :class="INPUT_CLASS"
      />
      <div class="ml-auto flex flex-wrap items-center gap-x-2 gap-y-1">
        <p class="hidden text-xs text-muted-foreground sm:block">
          Styling with <span class="font-medium text-primary">Markdown</span> is supported
        </p>
        <button type="submit" :disabled="submitDisabled" :class="buttonClass()">
          {{ pending ? 'Posting…' : (props.submitLabel ?? (props.parentId ? 'Post reply' : 'Post comment')) }}
        </button>
      </div>
    </div>
  </form>
</template>
