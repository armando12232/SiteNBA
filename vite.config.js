import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html',
        react: 'react.html',
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'https://site-nba-ten.vercel.app',
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
