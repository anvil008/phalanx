import type { ReactNode } from "react"
import { cn } from "@foundry/ui/lib/utils"

/** An eyebrow over a hairline, with optional mono meta pinned to the right. */
export function SectionHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-rule pb-1.5">
      <span className="phalanx-section-title flex-1">{title}</span>
      {children ? (
        <div className="meta-mono flex items-center gap-2">{children}</div>
      ) : null}
    </div>
  )
}

/** The same header on the top edge of a panel: the grouping unit the dashboard
 *  pages use wherever a list, a form or a feed needs a boundary. */
export function PanelSection({
  title,
  meta,
  className,
  children,
}: {
  title: string
  meta?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={cn("panel flex min-w-0 flex-col", className)}>
      <div className="panel-head">
        <span className="phalanx-section-title flex-1">{title}</span>
        {meta ? <div className="meta-mono flex items-center gap-2">{meta}</div> : null}
      </div>
      {children}
    </section>
  )
}
