import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
    // The multi-step form tests (customer wizard, lead call log, user form) take
    // 4-6 s on a slower laptop and failed intermittently at the 5 s default.
    testTimeout: 15000,
  },
})
