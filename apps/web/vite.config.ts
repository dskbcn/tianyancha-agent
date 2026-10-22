import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The agent (eve dev) listens on :2000. Proxying keeps the browser same-origin: no CORS, and the
// eve channel's localDev() auth admits the requests. In production Caddy does the same routing.
const AGENT = process.env.AGENT_URL ?? 'http://127.0.0.1:2000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/eve': { target: AGENT, changeOrigin: true },
      '/files': { target: AGENT, changeOrigin: true },
    },
  },
})
