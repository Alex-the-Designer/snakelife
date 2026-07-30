import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // IMPORTANT: replace 'snakelife' below with your actual GitHub repository name
  base: '/snakelife/',
})
