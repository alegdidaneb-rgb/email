import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The app is served behind the sandbox preview proxy, so we accept any Host
// header and bind to all interfaces.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    cors: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: true,
  },
})
