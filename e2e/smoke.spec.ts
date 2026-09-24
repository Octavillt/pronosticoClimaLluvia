import { expect, test } from '@playwright/test';

test.describe('Fase 0: humo', () => {
  test('la página carga con título y sin errores de consola', async ({ page }) => {
    const errores: string[] = [];
    page.on('console', (mensaje) => {
      if (mensaje.type() === 'error') errores.push(mensaje.text());
    });
    page.on('pageerror', (error) => errores.push(String(error)));

    await page.goto('/');

    await expect(page).toHaveTitle(/SistemaClima/);
    await expect(page.getByRole('heading', { name: 'SistemaClima' })).toBeVisible();
    expect(errores).toEqual([]);
  });
});
