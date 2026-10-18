import { createContext, type RefObject } from 'react'

// Portals stay inside their owning root to inherit CSS overrides as well as themeVars.
export const WidgetRootContext = createContext<RefObject<HTMLElement | null> | undefined>(undefined)
