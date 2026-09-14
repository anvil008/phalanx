import type { ReactNode } from "react"

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
