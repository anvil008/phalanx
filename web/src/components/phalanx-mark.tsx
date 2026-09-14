import { cn } from "@foundry/ui/lib/utils"

/* Phalanx raw SVG glyph: Interlocking defensive shield nodes forming an impenetrable perimeter
   around the central core command. */
export function PhalanxProductGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
      focusable="false"
    >
      {/* Outer shield perimeter */}
      <path
        d="M12 2L3 6V11C3 16.5 6.8 21.6 12 22.8C17.2 21.6 21 16.5 21 11V6L12 2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Inner interlocking shield */}
      <path
        d="M12 5.5L6 8.5V12C6 15.5 8.5 18.7 12 19.5C15.5 18.7 18 15.5 18 12V8.5L12 5.5Z"
        fill="currentColor"
        fillOpacity="0.32"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* Central command core */}
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
    </svg>
  )
}

/** Phalanx product mark: the shield glyph on a filled accent tile. Flat fill,
 *  dark ink, no shadow and no glow. */
export function PhalanxProductMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-control bg-primary text-primary-foreground select-none",
        className
      )}
    >
      <PhalanxProductGlyph className="size-4" />
    </span>
  )
}

/** Phalanx product lockup: the tile, then the product name over what it is. */
export function PhalanxProductBrand({
  compact = false,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <PhalanxProductMark />
      {!compact && (
        <span className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
          <span className="truncate text-[0.8125rem] font-semibold leading-tight tracking-[-0.01em] text-ink">
            Phalanx
          </span>
          <span className="truncate font-sans text-[0.625rem] leading-tight text-muted-foreground">
            Blue-team swarm
          </span>
        </span>
      )}
    </span>
  )
}

export const EsperProductMark = PhalanxProductMark
