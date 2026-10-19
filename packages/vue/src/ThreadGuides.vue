<script setup lang="ts">
import { toRef, useId, useTemplateRef } from 'vue'
import { useGuides } from './lib/useGuides'

const props = defineProps<{ listEl: HTMLElement | null }>()

defineOptions({ name: 'ThreadGuides' })

const clipEl = useTemplateRef<SVGRectElement>('clipEl')
const { guide } = useGuides(toRef(props, 'listEl'), clipEl)
// The clip path id must be unique per instance: two widgets on one page would
// otherwise share the first clip rectangle.
const clipId = `lc-thread-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
</script>

<template>
  <div v-if="guide.d !== ''" class="lc-thread-overlay" :style="{ width: `${guide.width}px` }" aria-hidden="true">
    <svg :viewBox="`0 0 ${guide.width} ${guide.height}`" :width="guide.width" :height="guide.height" aria-hidden="true">
      <defs>
        <clipPath :id="clipId" clipPathUnits="userSpaceOnUse">
          <!-- The active comment's band; scroll updates y and height in the DOM. -->
          <rect ref="clipEl" x="0" y="0" :width="guide.width" height="0" />
        </clipPath>
      </defs>
      <path class="track" :d="guide.d" />
      <path class="thumb" :d="guide.d" :clip-path="`url(#${clipId})`" />
    </svg>
  </div>
</template>
