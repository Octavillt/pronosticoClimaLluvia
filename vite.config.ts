import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { pwaSistemaclima } from './vite/pwa.ts';

export default defineConfig({
  plugins: [react(), pwaSistemaclima()],
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    reporters: ['default', 'json'],
    outputFile: {
      json: 'reportes/.tmp/vitest.json',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**'],
    },
  },
});
