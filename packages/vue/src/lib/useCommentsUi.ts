import { ref } from 'vue'
import type { ErrorInfo } from '@last-comments-widgets/client'

export function setPending(map: Record<string, boolean>, id: string, on: boolean): Record<string, boolean> {
  return { ...map, [id]: on }
}

// Independent UI flags for the composer widget: one pending map for moderation
// rows, one action error, and the identity/menu state. Kept apart from the
// thread window so a failing identity probe never touches the list status.
export function useCommentsUi() {
  const pendingModeration = ref<Record<string, boolean>>({})
  const actionError = ref<ErrorInfo | null>(null)
  const lockPending = ref(false)
  const identityPending = ref(false)
  const identityError = ref<{ info: ErrorInfo; retry: () => void } | null>(null)
  const unauthenticated = ref(false)

  function clearError() {
    actionError.value = null
  }

  return { pendingModeration, actionError, lockPending, identityPending, identityError, unauthenticated, clearError }
}
