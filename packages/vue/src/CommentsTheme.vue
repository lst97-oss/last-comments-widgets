<script setup lang="ts">
import { themeVarsToStyle, type WidgetTheme } from '@last-comments-widgets/client'
import { computed, useTemplateRef } from 'vue'
import { useTheme } from './lib/useTheme'
import { provideWidgetRoot } from './lib/widgetRoot'
import type { Theme } from './types'

// Hosts composing exported subcomponents need the same scope and portal ownership.
const props = withDefaults(defineProps<{ theme?: Theme; themeVars?: WidgetTheme }>(), {
  theme: 'system',
  themeVars: undefined,
})

defineOptions({ name: 'CommentsTheme' })

const rootEl = useTemplateRef<HTMLElement>('rootEl')
provideWidgetRoot(rootEl)
const dark = useTheme(() => props.theme)
const rootStyle = computed(() => themeVarsToStyle(props.themeVars, dark.value))
</script>

<template>
  <div ref="rootEl" class="lc-theme" :class="dark ? 'dark' : ''" :style="rootStyle">
    <slot />
  </div>
</template>
