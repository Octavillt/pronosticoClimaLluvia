import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: 'reportes/.tmp/test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reportes/.tmp/playwright-html', open: 'never' }],
    ['json', { outputFile: 'reportes/.tmp/playwright.json' }],
  ],
  use: {
    baseURL: 'http://localhost:4173',
  },
  webServer: {
    command: 'pnpm run build && pnpm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 240_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
