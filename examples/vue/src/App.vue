<script setup lang="ts">
import { computed, ref } from 'vue'
import { Comments, CommentViewer } from '@last-comments/vue'
import type { WidgetTheme } from '@last-comments/client'
import '@last-comments/vue/styles.css'

const site = ref('demo')
const baseUrl = ref('http://localhost:3000')
const pageUrl = ref(window.location.href)
const turnstileSiteKey = ref('')
const viewerUserId = ref('')
const viewerRole = ref('')
const signInUrl = ref('')
const preset = ref('Default')
const presets: Record<string, WidgetTheme> = {
  Default: {},
  Brand: { vars: { primary: 'oklch(0.55 0.2 250)', radius: '1rem' }, dark: { primary: 'oklch(0.7 0.18 250)' } },
}
const themeVars = computed(() => presets[preset.value])
</script>

<template>
  <main class="mx-auto grid max-w-2xl gap-4 p-6">
    <h1 class="text-xl font-semibold">last-comments Vue demo</h1>
    <label class="grid gap-1 text-sm">
      Theme preset
      <select v-model="preset" class="rounded border border-input px-2 py-1">
        <option v-for="name in Object.keys(presets)" :key="name" :value="name">{{ name }}</option>
      </select>
    </label>
    <Comments
      :site="site"
      :base-url="baseUrl"
      :page-url="pageUrl"
      :turnstile-site-key="turnstileSiteKey || undefined"
      :viewer-user-id="viewerUserId || undefined"
      :sign-in-url="signInUrl || undefined"
      :viewer-role="viewerRole === 'admin' || viewerRole === 'moderator' ? viewerRole : undefined"
      :theme-vars="themeVars"
    />
    <h2 class="mt-6 text-lg font-semibold">Read-only viewer</h2>
    <CommentViewer :site="site" :base-url="baseUrl" :page-url="pageUrl" :theme-vars="themeVars" />
    <details class="text-sm">
      <summary class="cursor-pointer font-medium">Advanced settings</summary>
      <div class="mt-2 grid gap-2">
        <label class="grid gap-1">
          Site key
          <input v-model="site" class="rounded border border-input px-2 py-1" />
        </label>
        <label class="grid gap-1">
          API base URL (same-origin proxy recommended for voting)
          <input v-model="baseUrl" class="rounded border border-input px-2 py-1" />
        </label>
        <label class="grid gap-1">
          Page URL
          <input v-model="pageUrl" class="rounded border border-input px-2 py-1" />
        </label>
        <label class="grid gap-1">
          Turnstile site key (guest posting)
          <input v-model="turnstileSiteKey" class="rounded border border-input px-2 py-1" />
        </label>
        <label class="grid gap-1">
          Viewer user ID (empty = guest, shows own Edit/Delete)
          <input v-model="viewerUserId" class="rounded border border-input px-2 py-1" />
        </label>
        <label class="grid gap-1">
          Sign-in URL (empty = start the server OAuth flow)
          <input v-model="signInUrl" class="rounded border border-input px-2 py-1" />
        </label>
        <label class="grid gap-1">
          Viewer role (admin/moderator show inline moderation; needs the same-origin proxy)
          <select v-model="viewerRole" class="rounded border border-input px-2 py-1">
            <option value="">none</option>
            <option value="admin">admin</option>
            <option value="moderator">moderator</option>
          </select>
        </label>
      </div>
    </details>
  </main>
</template>
