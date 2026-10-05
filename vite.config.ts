import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { stripCandidates } from './scripts/lib/audio/strip-candidates';

export default defineConfig({
  // Relative base so the build works inside Capacitor's file-less WebView origin.
  base: './',
  plugins: [
    {
      // The sound candidates are for the debug server's sound test only (spec 08 §8): the app never carries them.
      name: 'strip-audio-candidates',
      apply: 'build',
      closeBundle() {
        stripCandidates(resolve(import.meta.dirname, 'dist'));
      },
    },
  ],
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
