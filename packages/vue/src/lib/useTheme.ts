import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Theme } from '../types'

export function resolveDark(mode: Theme | undefined, matches: boolean): boolean {
  return mode === 'dark' || ((mode ?? 'system') === 'system' && matches)
}

// One media query and listener for every widget instance on the page; the
// subscriber count keeps the listener alive only while a system-themed widget
// is mounted.
let media: MediaQueryList | undefined
let subscribers = 0
const matches = ref(false)

function onMediaChange() {
  matches.value = Boolean(media?.matches)
}

function subscribeMedia() {
  if (typeof window === 'undefined') return
  media ??= window.matchMedia('(prefers-color-scheme: dark)')
  if (subscribers++ > 0) return
  matches.value = media.matches
  media.addEventListener('change', onMediaChange)
}

function unsubscribeMedia() {
  if (subscribers === 0) return
  if (--subscribers > 0) return
  media?.removeEventListener('change', onMediaChange)
}

export function useTheme(mode: () => Theme | undefined) {
  const subscribed = ref(false)
  const sync = () => {
    const system = (mode() ?? 'system') === 'system'
    if (system === subscribed.value) return
    subscribed.value = system
    if (system) subscribeMedia()
    else unsubscribeMedia()
  }
  watch(mode, sync)
  // The query is created on the client only; SSR and fixed modes never touch it.
  onMounted(sync)
  onUnmounted(() => {
    if (!subscribed.value) return
    subscribed.value = false
    unsubscribeMedia()
  })
  return computed(() => resolveDark(mode(), matches.value))
}
