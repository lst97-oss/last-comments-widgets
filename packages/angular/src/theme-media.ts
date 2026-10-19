import { signal, type Signal } from '@angular/core'

// One media query and change listener for every widget instance; the subscriber
// count keeps it alive only while a system-themed widget is mounted.
let query: MediaQueryList | null = null
let listeners = 0
const matches = signal(false)

function onChange() {
  matches.set(Boolean(query?.matches))
}

export function prefersDark(): Signal<boolean> {
  return matches.asReadonly()
}

export function subscribeSystemTheme(): () => void {
  if (typeof window === 'undefined') return () => {}
  query ??= window.matchMedia('(prefers-color-scheme: dark)')
  if (listeners++ === 0) {
    matches.set(query.matches)
    query.addEventListener('change', onChange)
  }
  return () => {
    if (listeners === 0) return
    if (--listeners > 0) return
    query?.removeEventListener('change', onChange)
  }
}
