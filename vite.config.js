import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'headset' ? [basicSsl()] : [],
  server: { port: 5173, strictPort: true },
  build: { chunkSizeWarningLimit: 650 },
}));
