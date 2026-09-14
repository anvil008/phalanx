import { lazy } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { PhalanxProvider } from "@/lib/store"
import { MissionControlPage } from "@/pages/mission-control"

const SimulationsPage = lazy(() => import("@/pages/simulations").then(({ SimulationsPage }) => ({ default: SimulationsPage })))
const IncidentsPage = lazy(() => import("@/pages/incidents").then(({ IncidentsPage }) => ({ default: IncidentsPage })))
const IncidentDetailPage = lazy(() =>
  import("@/pages/incident-detail").then(({ IncidentDetailPage }) => ({ default: IncidentDetailPage })),
)
const RosterPage = lazy(() => import("@/pages/roster").then(({ RosterPage }) => ({ default: RosterPage })))
const ProtocolPage = lazy(() => import("@/pages/protocol").then(({ ProtocolPage }) => ({ default: ProtocolPage })))
const AboutPage = lazy(() => import("@/pages/about").then(({ AboutPage }) => ({ default: AboutPage })))
const RangePage = lazy(() => import("@/pages/range").then(({ RangePage }) => ({ default: RangePage })))
const ChatPage = lazy(() => import("@/pages/chat").then(({ ChatPage }) => ({ default: ChatPage })))
const SettingsPage = lazy(() => import("@/pages/settings").then(({ SettingsPage }) => ({ default: SettingsPage })))

export function App() {
  return (
    <BrowserRouter>
      <PhalanxProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<MissionControlPage />} />
            <Route path="/simulations" element={<SimulationsPage />} />
            <Route path="/incidents" element={<IncidentsPage />} />
            <Route path="/incidents/:id" element={<IncidentDetailPage />} />
            <Route path="/range" element={<RangePage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/roster" element={<RosterPage />} />
            <Route path="/protocol" element={<ProtocolPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate replace to="/" />} />
          </Route>
        </Routes>
      </PhalanxProvider>
    </BrowserRouter>
  )
}
