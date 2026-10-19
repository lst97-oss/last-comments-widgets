import { onBeforeUnmount, onMounted, type Ref, ref } from 'vue'

// Runs `load` once, immediately unless `isLazy()` is on, in which case it waits
// for the widget root to near the viewport. `started` lets prop watchers skip
// reloads before the first fetch.
export function useLazyLoad(
  rootEl: Readonly<Ref<HTMLElement | null>>,
  isLazy: () => boolean,
  load: () => void,
): { started: Ref<boolean> } {
  const started = ref(false)
  let observer: IntersectionObserver | null = null

  function start() {
    if (started.value) return
    started.value = true
    load()
  }

  onMounted(() => {
    if (!isLazy() || typeof IntersectionObserver === 'undefined' || !rootEl.value) {
      start()
      return
    }
    observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer?.disconnect()
        observer = null
        start()
      },
      { rootMargin: '200px' },
    )
    observer.observe(rootEl.value)
  })

  onBeforeUnmount(() => observer?.disconnect())

  return { started }
}
