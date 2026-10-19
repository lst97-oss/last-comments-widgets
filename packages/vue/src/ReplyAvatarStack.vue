<script setup lang="ts">
import { collectThreadParticipants, type ThreadNode } from '@last-comments-widgets/client'
import { computed } from 'vue'
import LcAvatar from './Avatar.vue'

const props = defineProps<{ nodes: ThreadNode[] }>()

defineOptions({ name: 'ReplyAvatarStack' })

// Folded-group summary: who is inside the group, so a hidden group still shows
// its participants. Moderated authors are counted in the label, not marked here.
const participants = computed(() => collectThreadParticipants(props.nodes))
const visible = computed(() => participants.value.slice(0, 3))
const extra = computed(() => participants.value.length - visible.value.length)
</script>

<template>
  <div
    data-slot="avatar-group"
    class="lc-reply-stack group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background"
  >
    <LcAvatar
      v-for="participant in visible"
      :key="participant.key"
      :name="participant.name"
      :src="participant.avatarUrl"
    />
    <div
      v-if="extra > 0"
      data-slot="avatar-group-count"
      class="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3"
    >
      +{{ extra }}
    </div>
  </div>
</template>
