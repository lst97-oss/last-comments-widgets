type ObserverCtor = typeof IntersectionObserver

// One-shot viewport gate shared by both roots. Split from the components so the
// three branches (no lazy, no observer, observe until intersecting) are
// testable without a DOM.
export function observeInView(
  element: Element | null,
  lazy: boolean,
  observerCtor: ObserverCtor | undefined,
  onEnter: () => void,
): (() => void) | undefined {
  if (!lazy || !observerCtor) {
    onEnter()
    return
  }
  if (!element) return
  const observer = new observerCtor(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        onEnter()
        observer.disconnect()
      }
    },
    { rootMargin: '200px' },
  )
  observer.observe(element)
  return () => observer.disconnect()
}
