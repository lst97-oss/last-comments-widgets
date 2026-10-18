import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { Theme } from '../types'

export function useTheme(mode: () => Theme | undefined) {
  const dark = ref(mode() === 'dark')
  let media: MediaQueryList | undefined
  const update = () => {
    const theme = mode() ?? 'system'
    dark.value = theme === 'dark' || (theme === 'system' && Boolean(media?.matches))
  }
  watch(mode, update)
  onMounted(() => {
    media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', update)
    update()
  })
  onUnmounted(() => media?.removeEventListener('change', update))
  return dark
}
