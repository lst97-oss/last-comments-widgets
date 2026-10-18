import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const API = 'http://localhost:3000'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    proxy: {
      // Same-origin proxy so cookie voting works in the demo.
      '/api/comments': API,
      // The moderation POST is origin-checked against the API's own origin,
      // so the dev proxy rewrites Origin (a browser at :5173 never matches).
      '/api/moderation': {
        target: API,
        changeOrigin: true,
        configure: (proxy) => proxy.on('proxyReq', (proxyReq) => proxyReq.setHeader('origin', API)),
      },
    },
  },
})
