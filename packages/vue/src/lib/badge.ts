// Badge classes copied from the React reference's `badgeVariants` so every port
// renders the same chip. Vue has no cva, so the variants are plain maps.
export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

const BASE =
  'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!'

const VARIANTS: Record<BadgeVariant, string> = {
  default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
  secondary: 'bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
  destructive:
    'bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20',
  outline: 'border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground',
}

export function badgeClass(variant: BadgeVariant = 'default'): string {
  return `${BASE} ${VARIANTS[variant]}`
}
