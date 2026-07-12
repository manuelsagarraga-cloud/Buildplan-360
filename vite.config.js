import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/Buildplan-360/',
  plugins: [react()],
  server: {
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  }
})
