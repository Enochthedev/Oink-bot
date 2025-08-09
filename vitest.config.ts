import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/globalSetup.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@bot': resolve(__dirname, './src/bot'),
      '@config': resolve(__dirname, './src/config'),
      '@handlers': resolve(__dirname, './src/handlers'),
      '@models': resolve(__dirname, './src/models'),
      '@processors': resolve(__dirname, './src/processors'),
      '@services': resolve(__dirname, './src/services'),
      '@utils': resolve(__dirname, './src/utils'),
      '@types': resolve(__dirname, './src/types'),
      '@middleware': resolve(__dirname, './src/middleware'),
      '@constants': resolve(__dirname, './src/constants'),
    },
  },
})