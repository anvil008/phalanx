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
import { PhalanxProductBrand, PhalanxProductMark } from "@/components/phalanx-mark"
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
        "h-7.5 cursor-pointer gap-2.5 rounded-item px-2.5 text-xs font-medium shadow-none transition-all duration-140 active:scale-[0.98] [&_svg]:size-3.5",
        match
          ? "bg-sidebar-accent font-medium text-foreground shadow-none hover:bg-sidebar-accent/80"
          : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
      )}
    >
      <item.icon className="size-3.5 shrink-0" />
      <span className="truncate">{item.label}</span>
    </SidebarMenuButton>
  )
}

function AppSidebar() {
  const { connected, posture } = usePhalanx()
  const { state, toggleSidebar } = useSidebar()
  const isCollapsed = state === "collapsed"

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader
        className={cn(
          "h-12 border-b-0 border-none px-3 flex flex-row items-center justify-between",
          isCollapsed && "justify-center px-0"
        )}
      >
        <button
          type="button"
          onClick={() => {
            if (isCollapsed) toggleSidebar()
          }}
          className={cn(
            "flex items-center gap-2.5 text-left select-none transition-opacity",
            isCollapsed ? "cursor-pointer hover:opacity-85" : "cursor-default"
          )}
          title={isCollapsed ? "Expand sidebar" : undefined}
          aria-label={isCollapsed ? "Expand sidebar" : "Phalanx"}
        >
          <PhalanxProductBrand compact={isCollapsed} />
        </button>
        <SidebarTrigger
          className="size-7 rounded-control text-muted-foreground hover:bg-white/5 hover:text-foreground group-data-[collapsible=icon]:hidden"
          title="Collapse sidebar"
        />
      </SidebarHeader>
      <SidebarContent>
        {NAV_SECTIONS.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel className="text-[11px]">{section.label}</SidebarGroupLabel>
            <SidebarMenu>
              {section.items.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <NavButton item={item} />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="gap-2 px-3 pb-3 group-data-[collapsible=icon]:hidden">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <StatusDot tone={connected ? "positive" : "negative"} pulse={connected} />
          <span>{connected ? "Stream live" : "Stream down"}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <StatusDot
            tone={posture.threatLevel === "green" ? "positive" : posture.threatLevel === "amber" ? "warning" : "negative"}
            pulse={posture.threatLevel !== "green"}
          />
          <span className="uppercase">{posture.threatLevel}</span>
          <span className="ml-auto font-mono">{posture.openIncidents} open</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 justify-start px-1 text-xs text-muted-foreground"
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
      <SidebarInset>
        <PageChromeProvider>
          <PageChromeBar
            fallbackTitle="Phalanx"
            leading={
              <span className="flex items-center gap-2">
                <SidebarTrigger
                  className="-ml-1.5 mr-1 size-7 rounded-control text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  title="Toggle sidebar"
                />
                <PhalanxProductMark className="md:hidden" />
                <span className="sr-only md:hidden">Phalanx</span>
              </span>
            }
            className="h-12 border-b border-border/80 px-4 bg-background/95 backdrop-blur flex items-center justify-between shrink-0"
          />
          <Suspense fallback={<div className="p-6 text-xs text-muted-foreground">Loading…</div>}>
            <Outlet />
          </Suspense>
        </PageChromeProvider>
      </SidebarInset>
    </SidebarProvider>
  )
}
