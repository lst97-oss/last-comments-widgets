<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import { loadTurnstile, resolveTurnstileConfig, type TurnstileApi, type TurnstileOptions } from './lib/turnstile'

const props = defineProps<{
  siteKey: string
  // Parent-owned single-use token; '' means "no token" so CommentForm keeps
  // its existing string ref.
  modelValue?: string
  dark?: boolean
  turnstileOptions?: TurnstileOptions
}>()

const emit = defineEmits<{ 'update:modelValue': [token: string] }>()

defineOptions({ name: 'LcTurnstile' })

const container = useTemplateRef<HTMLDivElement>('container')
const config = computed(() => resolveTurnstileConfig(props.dark ?? false, props.turnstileOptions))

let widget: { api: TurnstileApi; id: string } | null = null
let generation = 0
let disposed = false

function detach() {
  const current = widget
  widget = null
  if (current) current.api.remove(current.id)
}

function attach() {
  const seq = ++generation
  detach()
  const node = container.value
  const siteKey = props.siteKey
  if (!node || !siteKey) return
  const { theme, size, appearance, language } = config.value
  loadTurnstile().then(
    (api) => {
      if (seq !== generation || disposed || !container.value) return
      try {
        const id = api.render(node, {
          sitekey: siteKey,
          theme,
          size,
          appearance,
          language,
          callback: (token: string) => {
            if (seq === generation) emit('update:modelValue', token)
          },
          'expired-callback': () => {
            if (seq === generation) emit('update:modelValue', '')
          },
          'error-callback': () => {
            if (seq === generation) emit('update:modelValue', '')
          },
        })
        // A newer render may have superseded this one while the script loaded.
        if (seq !== generation) {
          if (id) api.remove(id)
          return
        }
        widget = id ? { api, id } : null
      } catch (error) {
        // Turnstile rejects invalid render parameters by throwing rather than
        // calling error-callback; clear the token so submit stays off.
        console.error('[last-comments-widgets] Turnstile rejected the widget parameters', error)
        emit('update:modelValue', '')
      }
    },
    (error: unknown) => {
      if (seq === generation && !disposed) console.error('[last-comments-widgets] Turnstile failed to load', error)
    },
  )
}

function reset() {
  if (widget) widget.api.reset(widget.id)
}

defineExpose({ reset })

onMounted(attach)
// A widget re-render is a token reset: the old challenge cannot be posted.
watch(
  () => [props.siteKey, config.value.theme, config.value.size, config.value.appearance, config.value.language] as const,
  () => {
    emit('update:modelValue', '')
    attach()
  },
)
onBeforeUnmount(() => {
  disposed = true
  generation += 1
  detach()
})
</script>

<template>
  <!-- `.lc-turnstile` is the shared DOM hook for the container. Cloudflare owns
  everything inside the iframe, so hosts can only position/spacing-style this
  wrapper (and pick a light/dark theme) — not its background, border or shadow. -->
  <div ref="container" class="lc-turnstile" />
</template>
