import { defineConfig } from 'vitest/config'

export default defineConfig({
  server: {
    port: 4721,
    host: '127.0.0.1',
    strictPort: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 120_000,
  },
})
