import { inject, provide, type InjectionKey, type Ref } from 'vue'

// Portaled popups stay inside the widget root so they inherit its theme vars
// and per-instance overrides.
const WidgetRootKey: InjectionKey<Ref<HTMLElement | null>> = Symbol('lc-widget-root')

export function provideWidgetRoot(root: Ref<HTMLElement | null>): void {
  provide(WidgetRootKey, root)
}

export function useWidgetRoot(): Ref<HTMLElement | null> | null {
  return inject(WidgetRootKey, null)
}
