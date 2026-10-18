import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const API = 'http://localhost:3000'

export default defineConfig({
  plugins: [tailwindcss(), vue()],
  server: {
    proxy: {
      // Same-origin proxy so cookie voting works in the demo.
      '/api/comments': API,
      // The moderation POST is origin-checked against the API's own origin,
      // so the dev proxy rewrites Origin (a browser at :5174 never matches).
      '/api/moderation': {
        target: API,
        changeOrigin: true,
        configure: (proxy) => proxy.on('proxyReq', (proxyReq) => proxyReq.setHeader('origin', API)),
      },
    },
  },
})
