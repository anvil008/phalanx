import { Suspense } from "react"
import { NavLink, Outlet, useMatch, useResolvedPath } from "react-router-dom"
import { Button } from "@foundry/ui/components/button"
import { PageChromeBar, PageChromeProvider } from "@foundry/ui/components/page-chrome"
import { StatusDot } from "@foundry/ui/components/status-dot"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@foundry/ui/components/sidebar"
import { cn } from "@foundry/ui/lib/utils"
import { PhalanxProductMark } from "@/components/phalanx-mark"
import { NAV_SECTIONS, type NavItem } from "@/lib/nav"
import { phalanxApi, usePhalanx } from "@/lib/store"

function NavButton({ item }: { item: NavItem }) {
  const resolved = useResolvedPath(item.to)
  const match = useMatch({ path: resolved.pathname, end: item.end ?? false })
  return (
    <SidebarMenuButton
      size="sm"
      render={<NavLink to={item.to} end={item.end} />}
      isActive={!!match}
      tooltip={item.label}
      className="h-8 cursor-pointer gap-2.5 px-2.5 font-mono text-xs [&_svg]:size-3.5"
    >
      <item.icon className="size-3.5 shrink-0" />
      <span className="phalanx-nav-label truncate">{item.label}</span>
    </SidebarMenuButton>
  )
}

const POSTURE_TONE = {
  green: "text-positive",
  amber: "text-warning",
  red: "text-destructive",
  black: "text-destructive",
} as const

function AppSidebar() {
  const { connected, posture } = usePhalanx()
  const { state, toggleSidebar } = useSidebar()
  const isCollapsed = state === "collapsed"

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      {/* The only collapse control lives in the page chrome; the brand is a
          brand, and only expands the rail when it is the sole thing visible. */}
      <SidebarHeader
        className={cn(
          "flex h-14 flex-row items-center px-4",
          isCollapsed && "justify-center px-0",
        )}
      >
        <button
          type="button"
          onClick={() => {
            if (isCollapsed) toggleSidebar()
          }}
          className={cn(
            "flex min-w-0 items-center gap-2.5 text-left select-none transition-opacity",
            isCollapsed ? "cursor-pointer hover:opacity-85" : "cursor-default",
          )}
          title={isCollapsed ? "Expand sidebar" : undefined}
          aria-label={isCollapsed ? "Expand sidebar" : "Phalanx"}
        >
          <PhalanxProductMark className="size-7" />
          {!isCollapsed ? (
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[0.8125rem] font-semibold leading-tight tracking-[-0.01em] text-ink">
                Phalanx
              </span>
              <span className="truncate font-mono text-[0.625rem] leading-tight text-muted-foreground">
                Blue-team swarm
              </span>
            </span>
          ) : null}
        </button>
      </SidebarHeader>

      <SidebarContent className="px-1.5 py-2">
        {NAV_SECTIONS.map((section) => (
          <SidebarGroup key={section.label} className="py-1">
            <SidebarGroupLabel className="eyebrow px-2.5">{section.label}</SidebarGroupLabel>
            <SidebarMenu className="gap-1">
              {section.items.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <NavButton item={item} />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="gap-2 px-4 py-3 group-data-[collapsible=icon]:hidden">
        <div className="meta-mono flex items-center gap-2">
          <StatusDot tone={connected ? "positive" : "negative"} pulse={connected} size="xs" />
          <span>Stream · {connected ? "live" : "offline"}</span>
        </div>

        <div className="meta-mono flex items-center gap-2">
          <StatusDot
            tone={posture.threatLevel === "green" ? "positive" : posture.threatLevel === "amber" ? "warning" : "negative"}
            pulse={posture.threatLevel !== "green"}
            size="xs"
          />
          <span>
            Posture · <span className={POSTURE_TONE[posture.threatLevel]}>{posture.threatLevel}</span> ·{" "}
            {posture.openIncidents} open
          </span>
        </div>

        <Button
          size="sm"
          variant="ghost"
          className="mt-1 h-6.5 justify-start px-0 font-mono text-[0.6875rem]"
          title="Clear every incident, message and surface"
          onClick={() => void phalanxApi.reset()}
        >
          Reset world
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}

export function AppShell() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-page">
        <PageChromeProvider>
          <PageChromeBar
            fallbackTitle="Phalanx"
            leading={
              <span className="flex items-center gap-2">
                <SidebarTrigger
                  className="-ml-1.5 mr-1 size-7 text-muted-foreground"
                  title="Toggle sidebar"
                />
                <PhalanxProductMark className="size-6 md:hidden" />
                <span className="sr-only md:hidden">Phalanx</span>
              </span>
            }
            className="flex h-12 shrink-0 items-center justify-between px-5"
          />
          <Suspense fallback={<div className="meta-mono p-6">Loading…</div>}>
            <Outlet />
          </Suspense>
        </PageChromeProvider>
      </SidebarInset>
    </SidebarProvider>
  )
}
