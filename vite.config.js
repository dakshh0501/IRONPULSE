import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          firebase: ['firebase/app', 'firebase/firestore', 'firebase/auth', 'firebase/functions'],
          charts: ['recharts'],
          pdf: ['jspdf'],
        },
      },
    },
  },
  server: {
    port: 3000,
    hmr: { host: 'localhost' }
  }
})