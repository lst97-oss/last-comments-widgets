<script setup lang="ts">
import { safeUrl } from '@last-comments-widgets/client'
import { computed } from 'vue'

const props = defineProps<{ name: string; src?: string | null; size?: 'default' | 'sm' | 'lg' }>()
const avatarSize = computed(() => props.size ?? 'sm')

defineOptions({ name: 'LcAvatar' })

const avatarUrl = computed(() => safeUrl(props.src))
const initials = computed(() =>
  props.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase(),
)
</script>

<template>
  <span
    data-slot="avatar"
    :data-size="avatarSize"
    class="lc-avatar group/avatar relative flex size-8 shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6 dark:after:mix-blend-lighten"
  >
    <img
      v-if="avatarUrl"
      data-slot="avatar-image"
      :src="avatarUrl"
      :alt="props.name"
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      class="aspect-square size-full rounded-full object-cover"
    />
    <span
      v-else
      data-slot="avatar-fallback"
      class="flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground group-data-[size=sm]/avatar:text-xs"
    >
      {{ initials }}
    </span>
  </span>
</template>
