import { type RefObject, useEffect, useState } from 'react'

type ObserverCtor = typeof IntersectionObserver

// One-shot viewport gate. Split from the hook so the three branches (no lazy,
// no observer, observe until intersecting) are testable without a DOM.
export function observeInView(
  node: Element | null,
  lazy: boolean,
  observerCtor: ObserverCtor | undefined,
  onEnter: () => void,
): (() => void) | undefined {
  if (!lazy || !observerCtor) {
    onEnter()
    return
  }
  if (!node) return
  const observer = new observerCtor(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        onEnter()
        observer.disconnect()
      }
    },
    { rootMargin: '200px' },
  )
  observer.observe(node)
  return () => observer.disconnect()
}

// SSR and browsers without IntersectionObserver resolve in view immediately,
// so nothing stays hidden.
export function useInView(ref: RefObject<HTMLElement | null>, lazy: boolean): boolean {
  const [inView, setInView] = useState(!lazy)
  useEffect(() => {
    const observerCtor = typeof IntersectionObserver === 'undefined' ? undefined : IntersectionObserver
    return observeInView(ref.current, lazy, observerCtor, () => setInView(true))
  }, [lazy, ref])
  return inView
}
