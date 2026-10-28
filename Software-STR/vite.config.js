import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const demoMode = process.env.VITE_DEMO_MODE
    ?? process.env.DEMO_MODE
    ?? env.VITE_DEMO_MODE
    ?? env.DEMO_MODE
    ?? 'true'

  return {
    define: {
      'import.meta.env.VITE_DEMO_MODE': JSON.stringify(demoMode),
    },
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': 'http://localhost:8787',
      },
    },
  }
})
