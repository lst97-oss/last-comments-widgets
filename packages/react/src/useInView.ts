import { observeInView } from '@last-comments-widgets/client/enhance'
import { type RefObject, useEffect, useState } from 'react'

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
