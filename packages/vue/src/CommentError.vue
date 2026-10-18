<script setup lang="ts">
import type { ErrorInfo } from '@last-comments/client'

// One block for every failure in the widget. Copy comes from the client's
// describeError; this only decides layout and which action to offer.
const props = defineProps<{ info: ErrorInfo; signInHref?: string }>()
const emit = defineEmits<{ retry: []; 'sign-in': [] }>()
</script>

<template>
  <div
    role="alert"
    data-lc-error
    :data-error-code="props.info.code ?? ''"
    class="lc-error flex items-start gap-2 rounded-lg border bg-card px-2.5 py-2 text-left text-sm text-destructive"
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      class="mt-px size-4 shrink-0"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
    <div class="min-w-0 flex-1">
      <p class="font-medium">{{ props.info.title }}</p>
      <p class="mt-0.5 text-destructive/90">{{ props.info.message }}</p>
      <div v-if="props.info.action !== 'none'" class="mt-2 flex flex-wrap items-center gap-2">
        <button
          v-if="props.info.action === 'retry'"
          type="button"
          class="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-medium transition-all hover:bg-muted"
          @click="emit('retry')"
        >
          Try again
        </button>
        <a
          v-else-if="props.signInHref"
          :href="props.signInHref"
          class="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-transparent bg-primary px-2.5 text-sm font-medium whitespace-nowrap text-primary-foreground transition-all hover:bg-primary/80"
        >
          Sign in
        </a>
        <button
          v-else
          type="button"
          class="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-transparent bg-primary px-2.5 text-sm font-medium whitespace-nowrap text-primary-foreground transition-all hover:bg-primary/80"
          @click="emit('sign-in')"
        >
          Sign in
        </button>
      </div>
    </div>
  </div>
</template>
