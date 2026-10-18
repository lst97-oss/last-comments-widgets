<script setup lang="ts">
import { ApiError, describeError, type ErrorInfo, renderMarkdown } from '@lst97-oss/client'
import { Bold, CodeXml, Eye, Italic, Link2, List, ListOrdered, PenLine, Quote } from 'lucide-vue-next'
import { computed, nextTick, ref } from 'vue'
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
  onSubmit: (input: { authorName: string; bodyMarkdown: string; verificationToken?: string }) => Promise<void>
  onCancelReply?: () => void
}>()

const emit = defineEmits<{ submitted: [] }>()

const authorName = ref('')
const body = ref(props.initialBody ?? '')
const token = ref('')
const preview = ref(false)
const turnstile = ref<{ reset: () => void } | null>(null)
const busy = ref(false)
const formError = ref<ErrorInfo | null>(null)
const textareaEl = ref<HTMLTextAreaElement | null>(null)
const showName = computed(() => props.guest ?? true)
const bodyTooLong = computed(() => body.value.trim().length > 10_000)
const submitDisabled = computed(
  () =>
    busy.value ||
    bodyTooLong.value ||
    // Posting before the identity resolves would guess "guest" and send the wrong wire flag.
    Boolean(props.sessionPending) ||
    (showName.value && props.siteKey ? !token.value : false),
)

const iconBtn =
  'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none select-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4'

function wrapSelection(before: string, after: string, placeholder = 'text') {
  const el = textareaEl.value
  if (!el) return
  const start = el.selectionStart ?? body.value.length
  const end = el.selectionEnd ?? body.value.length
  const selected = body.value.slice(start, end) || placeholder
  body.value = `${body.value.slice(0, start)}${before}${selected}${after}${body.value.slice(end)}`
  void nextTick(() => {
    el.focus()
    const pos = start + before.length + selected.length + after.length
    el.setSelectionRange(pos, pos)
  })
}

function wrapLine(prefix: string, placeholder = 'text') {
  const el = textareaEl.value
  if (!el) return
  const start = el.selectionStart ?? body.value.length
  const end = el.selectionEnd ?? body.value.length
  const selected = body.value.slice(start, end) || placeholder
  const lines = selected.split('\n')
  body.value = `${body.value.slice(0, start)}${prefix}${lines.join(`\n${prefix}`)}${body.value.slice(end)}`
  void nextTick(() => {
    el.focus()
    el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length + prefix.length * lines.length)
  })
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
  if (busy.value) return
  const text = body.value.trim()
  if (!text) {
    // The server rejects an empty body with this same code and wording.
    formError.value = describeError(new ApiError('VALIDATION_ERROR', 'Please write a comment first.', 400), {
      title: props.errorTitle ?? "Your comment wasn't posted",
    })
    return
  }
  busy.value = true
  formError.value = null
  try {
    await props.onSubmit({
      // Guests post under the name they typed, or "Anonymous" when they left it blank.
      authorName: showName.value ? authorName.value.trim() || 'Anonymous' : '',
      bodyMarkdown: text,
      ...(props.siteKey && token.value ? { verificationToken: token.value } : {}),
    })
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
  <form class="lc-composer rounded-xl border border-border bg-muted/60 p-3" @submit.prevent="submit">
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
      class="flex min-h-24 w-full bg-transparent px-1 py-2 font-sans text-sm outline-none placeholder:text-muted-foreground"
    />
    <VueTurnstile
      v-if="props.siteKey"
      ref="turnstile"
      v-model="token"
      :site-key="props.siteKey"
      :theme="props.dark ? 'dark' : 'light'"
    />
    <CommentError
      v-if="formError"
      class="mt-2"
      :info="formError"
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
        {{ busy ? 'Posting…' : (props.submitLabel ?? (props.parentId ? 'Post reply' : 'Post comment')) }}
      </button>
    </div>
  </form>
</template>
