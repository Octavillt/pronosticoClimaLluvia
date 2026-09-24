import { defineConfig } from '@playwright/test';

const modoVisible = process.argv.includes('--headed');

export default defineConfig({
  workers: modoVisible ? 1 : undefined,
  timeout: modoVisible ? 60_000 : 30_000,
  testDir: './e2e',
  outputDir: 'reportes/.tmp/test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reportes/.tmp/playwright-html', open: 'never' }],
    ['json', { outputFile: 'reportes/.tmp/playwright.json' }],
  ],
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: { slowMo: modoVisible ? 1_000 : 0 },
  },
  webServer: {
    command: 'pnpm run build && pnpm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 240_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
