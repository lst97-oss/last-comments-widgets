import { useCallback, useSyncExternalStore } from 'react'
import type { Theme } from './types'

const QUERY = '(prefers-color-scheme: dark)'

// One subscription per theme value: a new subscribe identity would make React
// resubscribe on every render.
function subscribe(theme: Theme, onChange: () => void): () => void {
  if (theme !== 'system' || typeof window === 'undefined') return () => {}
  const query = window.matchMedia(QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function getSnapshot(theme: Theme): boolean {
  if (theme !== 'system') return theme === 'dark'
  return typeof window === 'undefined' ? false : window.matchMedia(QUERY).matches
}

// SSR keeps the fixed light first paint; the client resolves system mode on
// hydration and follows live media-query changes.
function getServerSnapshot(theme: Theme): boolean {
  return theme === 'dark'
}

export function useTheme(theme: Theme) {
  const subscribeToTheme = useCallback((onChange: () => void) => subscribe(theme, onChange), [theme])
  const getThemeSnapshot = useCallback(() => getSnapshot(theme), [theme])
  return useSyncExternalStore(subscribeToTheme, getThemeSnapshot, () => getServerSnapshot(theme))
}
