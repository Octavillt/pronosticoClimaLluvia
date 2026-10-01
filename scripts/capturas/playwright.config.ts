/**
 * Uso: pnpm capturas; CAPTURAS_ETIQUETA=antes pnpm capturas;
 * CAPTURAS_FILTRO='listo-alta__390' pnpm capturas.
 * PNG en reportes/.tmp/capturas/<etiqueta>/; reportes/.tmp está ignorado por git.
 */
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: '.',
  outputDir: '../../reportes/.tmp/capturas-tmp',
  reporter: 'list',
  workers: 1,
  use: {
    baseURL: 'http://localhost:4174',
    serviceWorkers: 'block',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    // Con pnpm 11, un -- adicional hace que Vite ignore --port y --strictPort.
    command: 'pnpm run build && pnpm run preview --port 4174 --strictPort',
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    url: 'http://localhost:4174',
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
