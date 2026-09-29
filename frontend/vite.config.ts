import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Same-origin proxy: the HttpOnly refresh cookie never has to cross origins.
    proxy: {
      '/api': 'http://localhost:5080',
      '/swagger': 'http://localhost:5080',
    },
  },
})
