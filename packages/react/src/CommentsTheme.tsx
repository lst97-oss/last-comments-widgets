import { themeVarsToStyle, type WidgetTheme } from '@last-comments/client'
import { type ComponentProps, useRef } from 'react'
import type { Theme } from './types'
import { useTheme } from './useTheme'
import { WidgetRootContext } from './WidgetRootContext'

// Hosts composing exported subcomponents need the same scope and portal ownership.
export function CommentsTheme({
  theme = 'system',
  themeVars,
  className = '',
  style,
  children,
  ...props
}: ComponentProps<'div'> & { theme?: Theme; themeVars?: WidgetTheme }) {
  const root = useRef<HTMLDivElement>(null)
  const dark = useTheme(theme)
  return (
    <WidgetRootContext value={root}>
      <div
        {...props}
        ref={root}
        className={`lc-theme ${dark ? 'dark' : ''} ${className}`}
        style={{ ...themeVarsToStyle(themeVars, dark), ...style }}
      >
        {children}
      </div>
    </WidgetRootContext>
  )
}
