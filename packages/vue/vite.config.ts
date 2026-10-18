import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [vue(), dts({ include: ['src/**/*.ts', 'src/**/*.vue'], exclude: ['src/**/*.test.ts'] })],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index',
    },
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      external: ['vue', 'vue-turnstile', 'lucide-vue-next', '@last-comments/client', 'clsx', 'tailwind-merge'],
    },
  },
})
