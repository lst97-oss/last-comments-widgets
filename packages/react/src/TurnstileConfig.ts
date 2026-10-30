import type { TurnstileOptions } from '@last-comments-widgets/client/enhance'
import { createContext } from 'react'

// Widget-wide Turnstile settings: the resolved light/dark mode plus the host's
// Cloudflare render options. Comments and CommentsTheme provide it; the
// Turnstile component reads it so neither CommentForm nor CommentItem has to
// thread it through the reply tree.
export type TurnstileConfig = { dark: boolean; options?: TurnstileOptions }

export const TurnstileConfigContext = createContext<TurnstileConfig>({ dark: false })
