import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // In local dev, proxy API calls directly to worker/groovy
      // (portal Go server handles this in production)
      '/api/worker': {
        target: 'http://localhost:8081',
        rewrite: (path) => path.replace(/^\/api\/worker/, ''),
      },
      '/api/groovy': {
        target: 'http://localhost:8082',
        rewrite: (path) => path.replace(/^\/api\/groovy/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
