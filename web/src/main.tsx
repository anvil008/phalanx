import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@/styles/phalanx.css"
import { App } from "./App.tsx"

const root = document.getElementById("root")
if (!root) throw new Error("Phalanx root element is missing")

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
