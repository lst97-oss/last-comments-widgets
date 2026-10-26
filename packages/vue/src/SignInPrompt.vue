<script setup lang="ts">
import type { ErrorInfo } from '@last-comments-widgets/client'

// A sign-in request, not a failure: the neutral prompt on login and private sites. Its colours come from
// the theme tokens (--lc-signin-*), so a host retheme reaches it. The button is wired like CommentError's.
const props = defineProps<{
  info: ErrorInfo
  // Which action was refused, so the prompt can be told apart in markup and tests.
  context: 'read' | 'write' | 'reply' | 'vote'
  signInHref?: string
}>()
const emit = defineEmits<{ 'sign-in': [] }>()

defineOptions({ name: 'SignInPrompt' })
</script>

<template>
  <div class="lc-signin" role="status" data-lc-signin="" :data-signin-context="props.context">
    <p class="font-medium">{{ props.info.title }}</p>
    <p>{{ props.info.message }}</p>
    <a v-if="props.signInHref" class="lc-signin-button" :href="props.signInHref">Sign in</a>
    <button v-else type="button" class="lc-signin-button" @click="emit('sign-in')">Sign in</button>
  </div>
</template>
