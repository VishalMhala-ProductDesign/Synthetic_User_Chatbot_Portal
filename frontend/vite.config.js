import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5191,
    strictPort: true,
    // Binds both IPv4 and IPv6 loopback — without this Vite picks one or the
    // other (observed: IPv6-only, meaning 127.0.0.1 couldn't even reach the
    // dev server), which is its own source of "Failed to fetch"-style errors.
    host: true,
    // Proxies /api to the backend so the frontend only ever calls its own
    // origin — sidesteps CORS/mixed-content entirely regardless of whether
    // the page is opened via localhost, 127.0.0.1, or a forwarded/tunneled
    // URL (VS Code port forwarding, etc.). Target uses 127.0.0.1 explicitly
    // (not "localhost") because uvicorn only binds IPv4 — Node resolving
    // "localhost" to the IPv6 loopback here would make the proxy itself fail.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8010',
        changeOrigin: true,
      },
    },
  },
})
