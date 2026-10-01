import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { ensambleFixture, forecastFixture } from '../tests/helpers/ensamble';
import { codificarPng } from '../tests/helpers/png';
import { cargadorSintetico, indiceRadarFixture } from '../tests/helpers/radar';

const CDMX = { latitude: 19.43, longitude: -99.13 };
const ORIGEN = 'http://localhost:4173';
const ESPERA_PWA_MS = 20_000;
const TILE_BASE = codificarPng(256, 256, new Uint8Array(256 * 256 * 4).fill(200));
const AVISO_ACTUALIZACION = 'Hay una versión nueva de SistemaClima.';
const AVISO_SIN_CONEXION = 'Sin conexión. Puede que el pronóstico no esté actualizado.';

test.use({ serviceWorkers: 'allow' });

async function preparar(page: Page, context: BrowserContext, conRadar = false) {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(CDMX);
  const inicio = new Date(Date.now() - 6 * 3_600_000);
  inicio.setUTCMinutes(0, 0, 0);
  const hora = inicio.toISOString().slice(0, 16);
  const terceros = new Set<string>();
  page.on('response', (respuesta) => {
    const url = new URL(respuesta.url());
    if (url.origin !== ORIGEN && respuesta.ok()) terceros.add(url.hostname);
  });
  // Las rutas específicas simulan proveedores; cualquier otro tercero se bloquea para evitar internet.
  await page.route('**/*', (ruta) =>
    new URL(ruta.request().url()).origin === ORIGEN ? ruta.continue() : ruta.abort(),
  );
  await page.route('**/ensemble-api.open-meteo.com/**', (ruta) =>
    ruta.fulfill({ json: ensambleFixture({ inicio: hora }) }),
  );
  await page.route('**/api.open-meteo.com/**', (ruta) => ruta.fulfill({ json: forecastFixture(72, hora) }));
  await page.route('**/api.rainviewer.com/**', (ruta) =>
    ruta.fulfill({ json: indiceRadarFixture({ numFrames: conRadar ? 3 : 0 }) }),
  );
  const cargar = cargadorSintetico({ dbz: () => null, cubierto: () => true });
  await page.route('**/tilecache.rainviewer.com/**', async (ruta) => {
    const tile = await cargar(ruta.request().url());
    await ruta.fulfill({ contentType: 'image/png', body: codificarPng(tile.ancho, tile.alto, tile.data) });
  });
  await page.route('**/tile.openstreetmap.org/**', (ruta) =>
    ruta.fulfill({ contentType: 'image/png', body: TILE_BASE }),
  );
  return terceros;
}

async function esperarControl(page: Page) {
  await expect.poll(() => page.evaluate(async () => {
    const sw = await navigator.serviceWorker.ready;
    return { estado: sw.active?.state, ruta: sw.active?.scriptURL, scope: sw.scope };
  }), { timeout: ESPERA_PWA_MS }).toEqual({
    estado: 'activated', ruta: `${ORIGEN}/sw.js`, scope: `${ORIGEN}/`,
  });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state), {
    timeout: ESPERA_PWA_MS,
  }).toBe('activated');
}

test.describe('Fase 4: PWA instalable', () => {
  test('el manifest y los íconos se descargan sin errores de instalabilidad propios de la app', async ({
    page,
    context,
    request,
  }) => {
    await preparar(page, context);
    await page.goto('/');
    await esperarControl(page);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
    const respuesta = await request.get('/manifest.webmanifest');
    expect(respuesta.status()).toBe(200);
    const manifest = await respuesta.json();
    expect(manifest).toMatchObject({
      name: 'SistemaClima',
      short_name: 'Clima',
      description: 'Probabilidad de lluvia calibrada con radar para México',
      lang: 'es-MX',
      id: './',
      start_url: './',
      scope: './',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#009966',
      categories: ['weather'],
    });
    for (const lado of [192, 512]) {
      const src = `./icons/icon-${lado}.png`;
      expect(manifest.icons).toContainEqual({
        src,
        sizes: `${lado}x${lado}`,
        type: 'image/png',
        purpose: 'any',
      });
      const icono = await request.get(new URL(src, respuesta.url()).href);
      expect(icono.status()).toBe(200);
      expect(icono.headers()['content-type']).toMatch(/^image\/png(?:;|$)/);
    }
    const cdp = await context.newCDPSession(page);
    try {
      await cdp.send('Page.enable');
      await cdp.send('Page.getAppManifest');
      // Los contextos de Playwright son off-the-record: Chromium con ventana reporta in-incognito.
      // Esa restricción del contexto de prueba no es un defecto de instalabilidad de la app.
      await expect.poll(async () => {
        const { installabilityErrors: errores } = await cdp.send('Page.getInstallabilityErrors');
        return errores.filter((error) => error.errorId !== 'in-incognito').map((error) => error.errorId);
      }, {
        timeout: ESPERA_PWA_MS,
      }).toEqual([]);
    } finally {
      await cdp.detach();
    }
  });

  test('el worker se registra, activa y controla la página recargada', async ({ page, context }) => {
    await preparar(page, context);
    await page.goto('/');
    await esperarControl(page);
    const respuesta = await page.reload();
    expect(respuesta?.fromServiceWorker()).toBe(true);
    await esperarControl(page);
    await expect(page.getByRole('heading', { name: 'SistemaClima', exact: true })).toBeVisible();
  });

  test('sin conexión carga shell y pronóstico vigente; al volver desaparece el aviso', async ({
    page,
    context,
  }) => {
    await preparar(page, context);
    await page.goto('/');
    await esperarControl(page);
    await expect(page.getByTestId('pop-ahora')).toHaveText('1%');
    await expect(page.getByText('Caché: consultado', { exact: true })).toBeVisible();
    const pronostico = await page.getByTestId('pop-ahora').textContent();
    try {
      // page.route deshabilita la caché HTTP; esta última ruta impide respuestas de fixtures sin red.
      await page.route('**/*', (ruta) =>
        new URL(ruta.request().url()).origin === ORIGEN ? ruta.continue() : ruta.abort(),
      );
      await context.setOffline(true);
      await expect.poll(() => page.evaluate(() => navigator.onLine), { timeout: ESPERA_PWA_MS }).toBe(false);
      const respuesta = await page.reload();
      expect(respuesta?.fromServiceWorker()).toBe(true);
      await expect(page.getByRole('heading', { name: 'SistemaClima', exact: true })).toBeVisible();
      await expect(page.getByText(AVISO_SIN_CONEXION, { exact: true })).toBeVisible();
      await expect(page.getByTestId('pop-ahora')).toHaveText(pronostico!);
      await expect(page.getByText('Caché: reutilizado', { exact: true })).toBeVisible();
      await context.setOffline(false);
      await expect(page.getByText(AVISO_SIN_CONEXION, { exact: true })).toHaveCount(0);
    } finally {
      await context.setOffline(false);
    }
  });

  test('el radar y mapa no añaden terceros al único caché del shell', async ({
    page,
    context,
    request,
  }) => {
    const terceros = await preparar(page, context, true);
    await page.goto('/');
    await esperarControl(page);
    await expect(page.getByTestId('mapa-radar')).toBeVisible();
    await expect.poll(() => [...terceros], { timeout: ESPERA_PWA_MS }).toEqual(expect.arrayContaining([
      'ensemble-api.open-meteo.com',
      'api.open-meteo.com',
      'api.rainviewer.com',
      'tilecache.rainviewer.com',
      'tile.openstreetmap.org',
    ]));
    const cachesGuardados = await page.evaluate(async () => {
      const nombres = await caches.keys();
      return Promise.all(nombres.map(async (nombre) => {
        const cache = await caches.open(nombre);
        const entradas = await cache.keys();
        return { nombre, urls: entradas.map((entrada) => entrada.url) };
      }));
    });
    expect(cachesGuardados).toHaveLength(1);
    expect(cachesGuardados[0].nombre).toMatch(/^sistemaclima-shell-[a-f0-9]{12}$/);
    const respuestaSw = await request.get('/sw.js');
    expect(respuestaSw.status()).toBe(200);
    const coincidencia = /const PRECACHE = (\[[\s\S]*?\]);/.exec(await respuestaSw.text());
    expect(coincidencia).not.toBeNull();
    const rutas = JSON.parse(coincidencia![1]) as string[];
    expect(rutas.length).toBeGreaterThan(0);
    const precache = new Set(rutas.map((ruta) => new URL(ruta, `${ORIGEN}/`).href));
    const urlsCacheadas = new Set(cachesGuardados[0].urls);
    expect(urlsCacheadas.size).toBe(precache.size);
    expect(urlsCacheadas).toEqual(precache);
    for (const url of cachesGuardados[0].urls) expect(new URL(url).origin).toBe(ORIGEN);
  });

  test('la primera instalación y una recarga sin cambios no muestran aviso de actualización', async ({
    page,
    context,
  }) => {
    await preparar(page, context);
    await page.goto('/');
    await esperarControl(page);
    await expect(page.getByText(AVISO_ACTUALIZACION, { exact: true })).toHaveCount(0);
    await page.reload();
    await esperarControl(page);
    await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
    await expect.poll(() => page.evaluate(async () => {
      const registro = await navigator.serviceWorker.ready;
      return registro.installing === null && registro.waiting === null;
    }), { timeout: ESPERA_PWA_MS }).toBe(true);
    await expect(page.getByText(AVISO_ACTUALIZACION, { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Actualizar', exact: true })).toHaveCount(0);
  });
});
