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
    // Ship the latest ratified ECMAScript standard (see the repo tsconfig).
    target: 'es2025',
    rollupOptions: {
      external: [
        'vue',
        '@lucide/vue',
        'reka-ui',
        '@last-comments-widgets/client',
        'clsx',
        'tailwind-merge',
        // Package and subpaths: KaTeX's stylesheet must stay a runtime import,
        // never inlined into the widget's own stylesheet.
        /^katex(\/|$)/,
        /^mermaid(\/|$)/,
      ],
    },
  },
})
