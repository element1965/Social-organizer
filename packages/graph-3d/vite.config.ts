import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo',
  plugins: [react()],
  server: { port: 5199, strictPort: true, host: '127.0.0.1' },
  resolve: { dedupe: ['react', 'react-dom', 'three'] },
});
