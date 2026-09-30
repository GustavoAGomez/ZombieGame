import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works inside Capacitor's file-less WebView origin.
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
});
