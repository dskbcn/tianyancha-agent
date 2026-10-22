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
    // Fail loudly on a busy port rather than moving to 5174 next to a stale server.
    strictPort: true,
    proxy: {
      '/eve': { target: AGENT, changeOrigin: true },
      '/files': { target: AGENT, changeOrigin: true },
      '/artifacts': { target: AGENT, changeOrigin: true },
      '/models': { target: AGENT, changeOrigin: true },
      '/chats': { target: AGENT, changeOrigin: true },
    },
  },
})
