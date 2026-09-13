import type { ReactNode } from "react"

export function SectionHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="phalanx-section-title flex-1">{title}</span>
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
    </div>
  )
}
