import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@shared': resolve(__dirname, '../shared/src') } },
  server: {
    port: 5173,
    fs: { allow: ['..'] },
    proxy: {
      '/api': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), admin: resolve(__dirname, 'admin.html') },
      output: { manualChunks: { three: ['three'], react: ['react', 'react-dom'] } },
    },
  },
});
