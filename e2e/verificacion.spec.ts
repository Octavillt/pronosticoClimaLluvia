import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { ensambleFixture, forecastFixture } from '../tests/helpers/ensamble';
import { codificarPng } from '../tests/helpers/png';
import { indiceRadarFixture } from '../tests/helpers/radar';
import { historialVerificacion } from '../tests/helpers/verificacion';

const CDMX = { latitude: 19.43, longitude: -99.13 };
const TILE_BASE = codificarPng(256, 256, new Uint8Array(256 * 256 * 4).fill(200));
const CONTADORES = [
  'exactitud-observaciones',
  'exactitud-horas',
  'exactitud-insuficientes',
  'exactitud-pares',
];

async function preparar(page: Page, context: BrowserContext) {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(CDMX);
  const inicio = new Date(Date.now() - 6 * 3_600_000);
  inicio.setUTCMinutes(0, 0, 0);
  const hora = inicio.toISOString().slice(0, 16);
  await page.route('**/ensemble-api.open-meteo.com/**', (ruta) =>
    ruta.fulfill({
      json: ensambleFixture({ inicio: hora, precipitacion: (m) => (m % 5 === 0 ? 0 : 1) }),
    }),
  );
  await page.route('**/api.open-meteo.com/**', (ruta) => ruta.fulfill({ json: forecastFixture(72, hora) }));
  // Sin radar: el contador de observaciones refleja exclusivamente los toques del usuario.
  await page.route('**/api.rainviewer.com/**', (ruta) =>
    ruta.fulfill({ json: indiceRadarFixture({ numFrames: 0 }) }),
  );
  await page.route('**/tile.openstreetmap.org/**', (ruta) =>
    ruta.fulfill({ contentType: 'image/png', body: TILE_BASE }),
  );
}

async function contadores(page: Page) {
  return Promise.all(CONTADORES.map((id) => page.getByTestId(id).textContent()));
}

test.describe('Fase 3: verificación y calibración local', () => {
  test('al pulsar Sí, está lloviendo el panel cuenta una observación', async ({ page, context }) => {
    await preparar(page, context);
    await page.goto('/');
    await expect(page.getByTestId('exactitud-observaciones')).toHaveText('0');
    await page.getByRole('button', { name: 'Sí, está lloviendo' }).click();
    await expect(page.getByText('Gracias, registrado.')).toBeVisible();
    await expect(page.getByTestId('exactitud-observaciones')).toHaveText('1');
    await page.setViewportSize({ width: 320, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('exportar y luego importar el archivo en un contexto nuevo conserva los contadores', async ({
    page,
    context,
    browser,
  }) => {
    await preparar(page, context);
    await page.goto('/');
    await page.getByRole('button', { name: 'Sí, está lloviendo' }).click();
    await expect(page.getByTestId('exactitud-observaciones')).toHaveText('1');
    const originales = await contadores(page);
    const descarga = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar historial' }).click();
    const archivo = await descarga;
    expect(archivo.suggestedFilename()).toMatch(/^sistemaclima-verificacion-\d{4}-\d{2}-\d{2}\.json$/);
    const ruta = await archivo.path();
    expect(ruta).not.toBeNull();
    const nuevoContexto = await browser.newContext({ baseURL: 'http://localhost:4173' });
    try {
      const nuevaPagina = await nuevoContexto.newPage();
      await preparar(nuevaPagina, nuevoContexto);
      await nuevaPagina.goto('/');
      await expect(nuevaPagina.getByTestId('exactitud-observaciones')).toHaveText('0');
      await nuevaPagina.getByLabel('Importar historial').setInputFiles(ruta!);
      await expect(nuevaPagina.getByRole('status')).toContainText(
        /Se agregaron \d+ predicciones y 1 observaciones/,
      );
      expect(await contadores(nuevaPagina)).toEqual(originales);
    } finally {
      await nuevoContexto.close();
    }
  });

  test('un historial con 150 horas verificadas calibra la pantalla pero guarda la PoP original', async ({
    page,
    context,
  }) => {
    await preparar(page, context);
    // Página vacía del mismo origen: termina de sembrar antes de cargar el código de la app.
    await page.route('**/sembrar', (ruta) =>
      ruta.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Semilla local</title>',
      }),
    );
    await page.goto('/sembrar');
    await page.evaluate(async (historial) => {
      await new Promise<void>((resolve, reject) => {
        const peticion = indexedDB.open('sistemaclima', 2);
        peticion.onupgradeneeded = () => {
          peticion.result.createObjectStore('cache', { keyPath: 'clave' });
          peticion.result.createObjectStore('predicciones', { keyPath: 'id' });
          peticion.result.createObjectStore('observaciones', { keyPath: 'id' });
        };
        peticion.onerror = () => reject(peticion.error);
        peticion.onsuccess = () => {
          const db = peticion.result;
          const tx = db.transaction(['predicciones', 'observaciones'], 'readwrite');
          for (const p of historial.predicciones) {
            tx.objectStore('predicciones').put(p);
          }
          for (const o of historial.observaciones) {
            tx.objectStore('observaciones').put(o);
          }
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      });
    }, historialVerificacion());
    await page.goto('/');
    await expect(page.getByTestId('aviso-calibracion')).toHaveText(
      'Calibrada con tu historial local (150 horas verificadas)',
    );
    const mostrado = Number.parseInt((await page.getByTestId('pop-ahora').textContent()) ?? '', 10);
    expect(mostrado).toBe(10);
    await page.getByRole('button', { name: 'Ver detalle de exactitud' }).click();
    await expect(page.getByRole('cell', { name: 'Calibrado', exact: true })).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(() =>
          new Promise<number>((resolve, reject) => {
            const peticion = indexedDB.open('sistemaclima', 2);
            peticion.onerror = () => reject(peticion.error);
            peticion.onsuccess = () => {
              const db = peticion.result;
              const lectura = db.transaction('predicciones', 'readonly').objectStore('predicciones').getAll();
              lectura.onsuccess = () => {
                const actual = lectura.result.find(
                  (p: { finMs: number; horizonteH: number }) => p.finMs > Date.now() && p.horizonteH === 1,
                );
                db.close();
                resolve(actual?.pop ?? 0);
              };
              lectura.onerror = () => {
                db.close();
                reject(lectura.error);
              };
            };
          }),
        ),
      )
      .toBeGreaterThan(0.7);
    await page.setViewportSize({ width: 320, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('importar un archivo inválido muestra el motivo y conserva los datos previos', async ({
    page,
    context,
  }) => {
    await preparar(page, context);
    await page.goto('/');
    await page.getByRole('button', { name: 'Sí, está lloviendo' }).click();
    await expect(page.getByTestId('exactitud-observaciones')).toHaveText('1');
    const originales = await contadores(page);
    await page.getByLabel('Importar historial').setInputFiles({
      name: 'invalido.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"formato":"otro"}'),
    });
    await expect(page.getByRole('alert')).toContainText('formato o versión desconocida');
    expect(await contadores(page)).toEqual(originales);
    await page.getByLabel('Importar historial').setInputFiles({
      name: 'roto.json',
      mimeType: 'application/json',
      buffer: Buffer.from('no es json'),
    });
    await expect(page.getByRole('alert')).toContainText('El archivo no es JSON válido.');
    expect(await contadores(page)).toEqual(originales);
  });
});
