import { themeVarsToStyle, type WidgetTheme } from '@last-comments-widgets/client'
import { type ComponentProps, useMemo, useRef } from 'react'
import { TurnstileConfigContext } from './TurnstileConfig'
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
  const turnstileConfig = useMemo(() => ({ dark }), [dark])
  return (
    <WidgetRootContext value={root}>
      <TurnstileConfigContext value={turnstileConfig}>
        <div
          {...props}
          ref={root}
          className={`lc-theme ${dark ? 'dark' : ''} ${className}`}
          style={{ ...themeVarsToStyle(themeVars, dark), ...style }}
        >
          {children}
        </div>
      </TurnstileConfigContext>
    </WidgetRootContext>
  )
}
