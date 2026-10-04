import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// Build the dependency-free server entry separately so the existing browser
// ES, UMD and IIFE bundles retain their names and formats.
export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/svg/index.ts'),
      fileName: () => 'svg.js',
      formats: ['es'],
    },
  },
})
