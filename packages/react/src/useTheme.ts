import { useEffect, useState } from 'react'
import type { Theme } from './types'

export function useTheme(theme: Theme) {
  // Keep the first client render identical to SSR; resolve system mode after hydration.
  const [dark, setDark] = useState(theme === 'dark')
  useEffect(() => {
    if (theme !== 'system') {
      setDark(theme === 'dark')
      return
    }
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    setDark(query.matches)
    const listener = (event: MediaQueryListEvent) => setDark(event.matches)
    query.addEventListener('change', listener)
    return () => query.removeEventListener('change', listener)
  }, [theme])
  return dark
}
