import type { ThreadSort } from '@last-comments-widgets/client'

import { Button } from './ui/button'

export type { ThreadSort }

export function ThreadSortToggle({ value, onChange }: { value: ThreadSort; onChange: (value: ThreadSort) => void }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a group of toggle buttons; a fieldset would add form semantics and a border every port would need to undo
    <div className="flex items-center gap-1" role="group" aria-label="Sort comments">
      <span className="mr-1 text-xs text-muted-foreground">Sort</span>
      <Button
        type="button"
        size="sm"
        variant={value === 'newest' ? 'secondary' : 'ghost'}
        aria-pressed={value === 'newest'}
        onClick={() => onChange('newest')}
      >
        Newest
      </Button>
      <Button
        type="button"
        size="sm"
        variant={value === 'oldest' ? 'secondary' : 'ghost'}
        aria-pressed={value === 'oldest'}
        onClick={() => onChange('oldest')}
      >
        Oldest
      </Button>
      <Button
        type="button"
        size="sm"
        variant={value === 'best' ? 'secondary' : 'ghost'}
        aria-pressed={value === 'best'}
        onClick={() => onChange('best')}
      >
        Best
      </Button>
    </div>
  )
}
