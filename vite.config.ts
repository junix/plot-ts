import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'PlotTS',
      fileName: 'plot-ts',
      formats: ['es', 'umd', 'iife']
    },
    rollupOptions: {
      external: ['echarts'],
      output: {
        globals: {
          echarts: 'echarts'
        }
      }
    }
  },
  server: {
    port: 3000,
    open: '/examples/demo.html'
  }
})
