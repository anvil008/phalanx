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
      className={cn(
        "h-8 cursor-pointer gap-2.5 rounded-item px-2.5 text-xs transition-all duration-150 active:scale-[0.98] [&_svg]:size-3.5 font-mono",
        match
          ? "bg-white/[0.08] font-bold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] border border-border/50"
          : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
      )}
    >
      <item.icon className="size-3.5 shrink-0" />
      <span className="truncate tracking-wide">{item.label}</span>
    </SidebarMenuButton>
  )
}

function AppSidebar() {
  const { connected, posture } = usePhalanx()
  const { state, toggleSidebar } = useSidebar()
  const isCollapsed = state === "collapsed"

  return (
    <Sidebar collapsible="icon" variant="sidebar" className="border-r border-border/80 bg-sidebar text-sidebar-foreground">
      <SidebarHeader
        className={cn(
          "h-14 border-b border-border/60 px-3.5 flex flex-row items-center justify-between",
          isCollapsed && "justify-center px-0",
        )}
      >
        <button
          type="button"
          onClick={() => {
            if (isCollapsed) toggleSidebar()
          }}
          className={cn(
            "flex items-center gap-2.5 text-left select-none transition-opacity",
            isCollapsed ? "cursor-pointer hover:opacity-85" : "cursor-default",
          )}
          title={isCollapsed ? "Expand sidebar" : undefined}
          aria-label={isCollapsed ? "Expand sidebar" : "Phalanx"}
        >
          <div className="relative">
            <PhalanxProductMark className="size-7 shadow-[0_0_14px_rgba(76,201,217,0.45)]" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col group-data-[collapsible=icon]:hidden">
              <span className="font-mono text-xs font-bold tracking-widest text-foreground uppercase">
                PHALANX
              </span>
              <span className="font-mono text-[9px] text-muted-foreground tracking-wider uppercase">
                BLUE-TEAM SWARM
              </span>
            </div>
          )}
        </button>
        <SidebarTrigger
          className="size-7 rounded-control text-muted-foreground hover:bg-white/5 hover:text-foreground group-data-[collapsible=icon]:hidden"
          title="Collapse sidebar"
        />
      </SidebarHeader>

      <SidebarContent className="px-1.5 py-2">
        {NAV_SECTIONS.map((section) => (
          <SidebarGroup key={section.label} className="py-1">
            <SidebarGroupLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70 px-2.5">
              {section.label}
            </SidebarGroupLabel>
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

      <SidebarFooter className="gap-2.5 border-t border-border/60 px-3.5 py-3 group-data-[collapsible=icon]:hidden bg-black/20">
        {/* Stream Live Indicator */}
        <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
          <StatusDot tone={connected ? "positive" : "negative"} pulse={connected} size="xs" />
          <span className="text-foreground font-medium uppercase tracking-wide">
            {connected ? "STREAM LIVE" : "STREAM OFFLINE"}
          </span>
        </div>

        {/* Threat Level Indicator */}
        <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
          <StatusDot
            tone={posture.threatLevel === "green" ? "positive" : posture.threatLevel === "amber" ? "warning" : "negative"}
            pulse={posture.threatLevel !== "green"}
            size="xs"
          />
          <span className="uppercase text-foreground font-medium">
            DEFCON: <strong className={posture.threatLevel === "green" ? "text-positive" : posture.threatLevel === "amber" ? "text-warning" : "text-destructive"}>{posture.threatLevel.toUpperCase()}</strong>
          </span>
          <span className="ml-auto text-[10px] rounded border border-border/70 bg-black/50 px-1.5 py-0.5 text-muted-foreground font-bold">
            {posture.openIncidents} OPEN
          </span>
        </div>

        <Button
          size="sm"
          variant="outline"
          className="h-6.5 justify-center px-2 font-mono text-[10.5px] text-muted-foreground hover:text-destructive hover:border-destructive/40 border-border/70 mt-1"
          title="Clear every incident, message and surface"
          onClick={() => void phalanxApi.reset()}
        >
          RESET WORLD STATE
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}

export function AppShell() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-background">
        <PageChromeProvider>
          <PageChromeBar
            fallbackTitle="Phalanx"
            leading={
              <span className="flex items-center gap-2">
                <SidebarTrigger
                  className="-ml-1.5 mr-1 size-7 rounded-control text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  title="Toggle sidebar"
                />
                <PhalanxProductMark className="md:hidden size-6" />
                <span className="sr-only md:hidden">Phalanx</span>
              </span>
            }
            className="h-12 border-b border-border px-4 bg-background/90 backdrop-blur-md flex items-center justify-between shrink-0"
          />
          <Suspense fallback={<div className="p-6 font-mono text-xs text-muted-foreground">Initializing Phalanx runtime…</div>}>
            <Outlet />
          </Suspense>
        </PageChromeProvider>
      </SidebarInset>
    </SidebarProvider>
  )
}
