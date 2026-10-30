// Applies the host theme and CSS variables to the widget root.

import { THEME_CSS_VARIABLES, themeVarsToStyle } from '@last-comments-widgets/client'
import type { MountOptions, Theme } from './types'

// Restore host-owned inline values and classes when a widget releases its root.
export function setupTheme(el: HTMLElement, theme: Theme, options: Pick<MountOptions, 'themeVars'>) {
  const hadRoot = el.classList.contains('lc-comments')
  const wasDark = el.classList.contains('dark')
  const original = new Map<string, { value: string; priority: string }>(
    Object.values(THEME_CSS_VARIABLES).map((key) => [
      key,
      { value: el.style.getPropertyValue(key), priority: el.style.getPropertyPriority(key) },
    ]),
  )
  const touched = new Set<string>()
  let applied: Record<string, string> = {}
  const restore = (key: string) => {
    const saved = original.get(key)
    if (saved?.value) el.style.setProperty(key, saved.value, saved.priority)
    else el.style.removeProperty(key)
  }
  el.classList.add('lc-comments')
  return {
    apply() {
      const dark =
        theme === 'dark' ||
        (theme === 'system' &&
          typeof window !== 'undefined' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches)
      el.classList.toggle('dark', dark)
      const next = themeVarsToStyle(options.themeVars, dark)
      for (const key of Object.keys(applied)) {
        if (!(key in next)) restore(key)
      }
      for (const [key, value] of Object.entries(next)) {
        touched.add(key)
        el.style.setProperty(key, value)
      }
      applied = next
    },
    cleanup() {
      for (const key of touched) restore(key)
      el.classList.toggle('lc-comments', hadRoot)
      el.classList.toggle('dark', wasDark)
    },
  }
}
