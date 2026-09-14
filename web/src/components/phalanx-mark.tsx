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

/** Phalanx glyph tile for the places a wordmark will not fit: mobile chrome and
 *  the favicon. Flat page surface, one hairline, an accent glyph — no fill,
 *  no shadow, no glow. */
export function PhalanxProductMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-control border border-rule-soft text-accent-indigo select-none",
        className
      )}
    >
      <PhalanxProductGlyph className="size-4" />
    </span>
  )
}

/** Phalanx wordmark: the product name set in the title serif with the accent
 *  dot that closes the author's own mark. */
export function PhalanxWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span className="title-serif text-[1.375rem] leading-none">Phalanx</span>
      <span
        aria-hidden
        className="size-[7px] shrink-0 rounded-full bg-accent-indigo"
      />
    </span>
  )
}

/** Phalanx product lockup: glyph tile + wordmark. */
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
      {!compact && <PhalanxWordmark className="group-data-[collapsible=icon]:hidden" />}
    </span>
  )
}

export const EsperProductMark = PhalanxProductMark
