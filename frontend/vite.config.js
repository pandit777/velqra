import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  
  server: {
    host: '0.0.0.0',
    port: 10000,
    allowedHosts: [
      'atelimarket.shop',
      'www.atelimarket.shop',
      'atelimarket-frontend-xzjb.onrender.com',
      '.onrender.com',
      'localhost'
    ]
  },
  
  preview: {
    host: '0.0.0.0',
    port: 10000,
    allowedHosts: [
      'atelimarket.shop',
      'www.atelimarket.shop',
      'atelimarket-frontend-xzjb.onrender.com',
      '.onrender.com',
      'localhost'
    ]
  },
  
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'esbuild', // ✅ esbuild use karein (no terser needed)
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          axios: ['axios']
        }
      }
    },
    chunkSizeWarningLimit: 1000
  },
  
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production')
  },
  
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'axios']
  },
  
  css: {
    devSourcemap: true
  }
})
