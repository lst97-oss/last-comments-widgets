<script setup lang="ts">
import { type ErrorInfo, type ViewerSession } from '@last-comments-widgets/client'
import { Check, ChevronDown } from 'lucide-vue-next'
import { onBeforeUnmount, useTemplateRef, watch } from 'vue'
import CommentError from './CommentError.vue'
import { buttonClass } from './lib/button'

const props = defineProps<{
  commentAs: 'account' | 'anonymous'
  signedIn: boolean
  session: ViewerSession | null
  identityPending: boolean
  sessionPending: boolean
  identityLabel: string
  identityOpen: boolean
  signInUrl?: string
  error?: { info: ErrorInfo; retry: () => void } | null
  onChoose: (value: 'account' | 'anonymous') => void
  onSignIn: () => void
  onSignOut: () => void
}>()

const emit = defineEmits<{ 'update:identityOpen': [boolean] }>()

defineOptions({ name: 'IdentityMenu' })

const identityEl = useTemplateRef<HTMLElement>('identityEl')

function toggle() {
  emit('update:identityOpen', !props.identityOpen)
}

function close() {
  emit('update:identityOpen', false)
}

function closeOnOutsidePointer(event: PointerEvent) {
  if (!identityEl.value?.contains(event.target as Node)) close()
}

function closeOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

watch(
  () => props.identityOpen,
  (open) => {
    if (typeof document === 'undefined') return
    if (open) {
      document.addEventListener('pointerdown', closeOnOutsidePointer)
      document.addEventListener('keydown', closeOnEscape)
    } else {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  },
)

onBeforeUnmount(() => {
  if (typeof document === 'undefined') return
  document.removeEventListener('pointerdown', closeOnOutsidePointer)
  document.removeEventListener('keydown', closeOnEscape)
})
</script>

<template>
  <!-- Moderators post as themselves through the moderation endpoint: the
       anonymous/account switcher does not apply. -->
  <span class="text-xs text-muted-foreground">Comment as</span>
  <div ref="identityEl" class="relative min-w-0">
    <button
      type="button"
      :class="[buttonClass('outline', 'sm'), 'lc-identity-trigger']"
      aria-haspopup="menu"
      :aria-expanded="props.identityOpen"
      :disabled="props.identityPending || props.sessionPending"
      @click="toggle"
    >
      <span v-if="props.sessionPending" class="block h-4 w-16 animate-pulse rounded bg-muted"></span>
      <span v-else class="label max-w-[10rem] truncate">{{ props.identityLabel }}</span>
      <ChevronDown aria-hidden="true" />
    </button>
    <div
      v-if="props.identityOpen"
      role="menu"
      class="lc-identity-menu absolute top-full right-0 mt-1 w-48 max-w-[calc(var(--spacing)*8)] rounded-lg border border-border bg-popover p-1 text-sm text-popover-foreground"
    >
      <button
        type="button"
        role="menuitemradio"
        :aria-checked="props.commentAs === 'anonymous' || !props.signedIn"
        class="lc-identity-item flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
        @click="props.onChoose('anonymous')"
      >
        <span class="flex-1">Anonymous</span>
        <Check v-if="props.commentAs === 'anonymous' || !props.signedIn" class="size-4 shrink-0" aria-hidden="true" />
      </button>
      <button
        v-if="props.signedIn"
        type="button"
        role="menuitemradio"
        :aria-checked="props.commentAs === 'account'"
        class="lc-identity-item flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
        @click="props.onChoose('account')"
      >
        <span class="flex-1 truncate">{{ props.session?.name || 'Your account' }} (you)</span>
        <Check v-if="props.commentAs === 'account'" class="size-4 shrink-0" aria-hidden="true" />
      </button>
      <a
        v-else-if="props.signInUrl"
        :href="props.signInUrl"
        role="menuitem"
        class="lc-identity-item block w-full rounded-md px-2 py-1.5 text-left hover:bg-accent"
        @click="close"
      >
        Sign in…
      </a>
      <button
        v-else
        type="button"
        role="menuitem"
        class="lc-identity-item block w-full rounded-md px-2 py-1.5 text-left hover:bg-accent disabled:opacity-50"
        :disabled="props.identityPending"
        @click="props.onSignIn"
      >
        Sign in…
      </button>
      <template v-if="props.session">
        <div role="separator" class="my-1 h-px bg-border" />
        <button
          type="button"
          role="menuitem"
          class="lc-identity-item block w-full rounded-md px-2 py-1.5 text-left hover:bg-accent disabled:opacity-50"
          :disabled="props.identityPending"
          @click="props.onSignOut"
        >
          Sign out
        </button>
      </template>
    </div>
  </div>
  <div v-if="props.error" class="w-full">
    <CommentError
      :info="props.error.info"
      :sign-in-href="props.signInUrl"
      @retry="props.error.retry()"
      @sign-in="props.onSignIn"
    />
  </div>
</template>
