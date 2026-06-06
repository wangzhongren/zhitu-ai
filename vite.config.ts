import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src/renderer"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:18674',
        changeOrigin: true,
      },
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
