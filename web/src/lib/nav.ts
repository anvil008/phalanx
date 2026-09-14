import { Boxes, FlaskConical, MessagesSquare, Network, Radar, ScrollText, Settings, ShieldAlert, type LucideIcon } from "lucide-react"

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

export interface NavSection {
  label: string
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Operations",
    items: [
      { to: "/", label: "Mission Control", icon: Radar, end: true },
      { to: "/simulations", label: "Simulation Lab", icon: FlaskConical },
      { to: "/incidents", label: "Incident Response Team", icon: ShieldAlert },
      { to: "/chat", label: "Agent Chat", icon: MessagesSquare },
    ],
  },
  {
    label: "Swarm",
    items: [
      { to: "/roster", label: "Agent Roster", icon: Boxes },
      { to: "/protocol", label: "Protocol Trace", icon: Network },
      { to: "/about", label: "How this works", icon: ScrollText },
      { to: "/settings", label: "Model Settings", icon: Settings },
    ],
  },
]

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items)
