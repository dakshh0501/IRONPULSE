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
          qrscanner: ['html5-qrcode'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
    cssCodeSplit: true,
    sourcemap: false,
    minify: 'esbuild',
    target: 'es2020',
    modulePreload: false,
  },
  server: {
    port: 3000,
    hmr: { host: 'localhost' }
  }
})