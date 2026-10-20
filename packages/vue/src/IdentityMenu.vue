<script setup lang="ts">
import { type ErrorInfo, type ViewerSession } from '@last-comments-widgets/client'
import { Check, ChevronDown } from '@lucide/vue'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import { computed } from 'vue'
import CommentError from './CommentError.vue'
import { buttonClass } from './lib/button'
import { useWidgetRoot } from './lib/widgetRoot'

const props = defineProps<{
  commentAs: 'account' | 'anonymous'
  signedIn: boolean
  session: ViewerSession | null
  identityPending: boolean
  sessionPending: boolean
  identityLabel: string
  identityOpen: boolean
  signInUrl?: string
  error?: { info: ErrorInfo; retry: () => void } | null
  onChoose: (value: 'account' | 'anonymous') => void
  onSignIn: () => void
  onSignOut: () => void
}>()

const emit = defineEmits<{ 'update:identityOpen': [boolean] }>()

defineOptions({ name: 'IdentityMenu' })

// Portaled into the widget root so the trigger stays a bare flex child of the
// composer's identity row (a wrapper div would blockify it back to inline-flex).
const root = useWidgetRoot()

// A guest never has an account row to pick, so the radio group reads anonymous.
const activeValue = computed(() => (props.commentAs === 'anonymous' || !props.signedIn ? 'anonymous' : 'account'))

const CONTENT_CLASS =
  'lc-identity-menu z-50 min-w-32 max-w-[calc(100vw-2rem)] overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground ring-1 ring-foreground/10 outline-none'
const RADIO_ITEM_CLASS =
  "lc-identity-item relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
const ITEM_CLASS =
  "lc-identity-item group/dropdown-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
const INDICATOR_CLASS = 'pointer-events-none absolute right-2 flex items-center justify-center'
</script>

<template>
  <!-- Moderators post as themselves through the moderation endpoint: the
       anonymous/account switcher does not apply. -->
  <span class="text-xs text-muted-foreground">Comment as</span>
  <DropdownMenuRoot
    :open="props.identityOpen"
    :modal="false"
    @update:open="(open: boolean) => emit('update:identityOpen', open)"
  >
    <DropdownMenuTrigger
      :class="[buttonClass('outline', 'sm'), 'lc-identity-trigger']"
      :disabled="props.identityPending || props.sessionPending"
    >
      <span v-if="props.sessionPending" class="block h-4 w-16 animate-pulse rounded bg-muted"></span>
      <span v-else class="label max-w-[10rem] truncate">{{ props.identityLabel }}</span>
      <ChevronDown aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuPortal :to="root ?? undefined">
      <DropdownMenuContent :class="CONTENT_CLASS" align="start" :side-offset="4">
        <DropdownMenuRadioGroup
          :model-value="activeValue"
          @update:model-value="(value) => props.onChoose(value as 'account' | 'anonymous')"
        >
          <DropdownMenuRadioItem :class="RADIO_ITEM_CLASS" value="anonymous">
            <span class="truncate">Anonymous</span>
            <span :class="INDICATOR_CLASS">
              <Check v-if="activeValue === 'anonymous'" class="size-4 shrink-0" aria-hidden="true" />
            </span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem v-if="props.signedIn" :class="RADIO_ITEM_CLASS" value="account">
            <span class="truncate">{{ props.session?.name || 'Your account' }} (you)</span>
            <span :class="INDICATOR_CLASS">
              <Check v-if="activeValue === 'account'" class="size-4 shrink-0" aria-hidden="true" />
            </span>
          </DropdownMenuRadioItem>
          <DropdownMenuItem
            v-else-if="props.signInUrl"
            as-child
            :class="ITEM_CLASS"
            :disabled="props.identityPending"
            @select="props.onSignIn"
          >
            <a :href="props.signInUrl">Sign in…</a>
          </DropdownMenuItem>
          <DropdownMenuItem v-else :class="ITEM_CLASS" :disabled="props.identityPending" @select="props.onSignIn">
            Sign in…
          </DropdownMenuItem>
        </DropdownMenuRadioGroup>
        <template v-if="props.session">
          <DropdownMenuSeparator class="-mx-1 my-1 h-px bg-border" />
          <DropdownMenuItem :class="ITEM_CLASS" :disabled="props.identityPending" @select="props.onSignOut">
            Sign out
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
  <div v-if="props.error" class="w-full">
    <CommentError
      :info="props.error.info"
      :sign-in-href="props.signInUrl"
      @retry="props.error.retry()"
      @sign-in="props.onSignIn"
    />
  </div>
</template>
