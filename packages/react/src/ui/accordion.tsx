import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '../lib/utils'

function Accordion({ className, ...props }: AccordionPrimitive.Root.Props) {
  return <AccordionPrimitive.Root data-slot="accordion" className={cn('flex w-full flex-col', className)} {...props} />
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item data-slot="accordion-item" className={cn('not-last:border-b', className)} {...props} />
  )
}

function AccordionTrigger({ className, children, ...props }: AccordionPrimitive.Trigger.Props) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          'group/accordion-trigger relative flex flex-1 items-center justify-between rounded-lg border border-transparent text-left text-sm font-medium transition-all outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:pointer-events-none aria-disabled:opacity-50 **:data-[slot=accordion-trigger-icon]:ml-auto **:data-[slot=accordion-trigger-icon]:size-4 **:data-[slot=accordion-trigger-icon]:text-muted-foreground',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown
          data-slot="accordion-trigger-icon"
          aria-hidden="true"
          className="pointer-events-none shrink-0 group-aria-expanded/accordion-trigger:hidden"
        />
        <ChevronUp
          data-slot="accordion-trigger-icon"
          aria-hidden="true"
          className="pointer-events-none hidden shrink-0 group-aria-expanded/accordion-trigger:inline"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({ className, children, ...props }: AccordionPrimitive.Panel.Props) {
  // The panel clips the reply cards, so their shadows need room outside the
  // clip edge. `overflow: clip` (not `hidden`) is what honors the margin.
  // shortcut: shadows reaching past 16px still clip; raise it if a host theme needs more.
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className="overflow-clip text-sm [overflow-clip-margin:16px] data-ending-style:[overflow-clip-margin:0px]"
      {...props}
    >
      <div
        className={cn(
          'h-(--accordion-panel-height) transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0',
          className,
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Panel>
  )
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger }
