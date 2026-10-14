import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const electron = process.env.ELECTRON === '1';

export default defineConfig({
  base: electron ? './' : '/',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 47321,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 47321,
    strictPort: true,
  },
});
