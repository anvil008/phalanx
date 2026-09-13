import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const PHALANX_API = process.env.PHALANX_API ?? process.env.ESPER_API ?? "http://127.0.0.1:8095"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5195,
    strictPort: true,
    proxy: {
      "/api": { target: PHALANX_API, changeOrigin: true },
      "/healthz": { target: PHALANX_API, changeOrigin: true },
      "/.well-known": { target: PHALANX_API, changeOrigin: true },
    },
  },
  build: {
    // The server serves this directory directly; `npm run build` in web/ must
    // run before the server is started in production.
    outDir: "../server/webdist",
    emptyOutDir: true,
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  // @foundry/ui is a file: dependency, so Vite does not pre-bundle its
  // transitive CJS deps in dev; without this the base-ui sidebar crashes on
  // the use-sync-external-store shim.
  optimizeDeps: {
    include: ["use-sync-external-store/shim", "use-sync-external-store/shim/with-selector"],
  },
})
