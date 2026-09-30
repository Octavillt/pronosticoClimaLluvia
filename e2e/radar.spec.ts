import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { PALETA_OPACA } from '../src/nowcast/paleta';
import { pixelGlobal } from '../src/nowcast/tiles';
import { ensambleFixture, forecastFixture } from '../tests/helpers/ensamble';
import { codificarPng, decodificarPng } from '../tests/helpers/png';
import {
  cargadorSintetico,
  indiceRadarFixture,
  tormentaQueAvanza,
  ZOOM,
  type EscenaRadar,
} from '../tests/helpers/radar';

const CDMX = { latitude: 19.43, longitude: -99.13 };
const P = pixelGlobal({ lat: CDMX.latitude, lon: CDMX.longitude }, ZOOM);

/** Tile gris del mapa base, para no salir a OpenStreetMap. */
const TILE_BASE = codificarPng(256, 256, new Uint8Array(256 * 256 * 4).fill(200));

/** Primera hora de la serie: 6 h atrás, para que "ahora" quede dentro de las 72 h. */
function inicioSerie(): string {
  const inicio = new Date(Date.now() - 6 * 3_600_000);
  inicio.setUTCMinutes(0, 0, 0);
  return inicio.toISOString().slice(0, 16);
}

async function conGeolocalizacion(context: BrowserContext) {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(CDMX);
}

async function conProveedores(
  page: Page,
  opciones: { escena?: EscenaRadar; indiceHttp?: number } = {},
) {
  await page.route('**/ensemble-api.open-meteo.com/**', (ruta) =>
    ruta.fulfill({ json: ensambleFixture({ inicio: inicioSerie() }) }),
  );
  await page.route('**/api.open-meteo.com/**', (ruta) =>
    ruta.fulfill({ json: forecastFixture(72, inicioSerie()) }),
  );
  await page.route('**/api.rainviewer.com/**', (ruta) =>
    opciones.indiceHttp
      ? ruta.fulfill({ status: opciones.indiceHttp, json: { error: 'boom' } })
      : ruta.fulfill({ json: indiceRadarFixture({ ahoraMs: Date.now() }) }),
  );
  const cargar = cargadorSintetico(
    opciones.escena ?? { dbz: () => null, cubierto: () => true },
  );
  // Los PNG se sirven de verdad: así el navegador los decodifica con su canvas real.
  await page.route('**/tilecache.rainviewer.com/**', async (ruta) => {
    const tile = await cargar(ruta.request().url());
    await ruta.fulfill({
      contentType: 'image/png',
      body: codificarPng(tile.ancho, tile.alto, tile.data),
    });
  });
  await page.route('**/tile.openstreetmap.org/**', (ruta) =>
    ruta.fulfill({ contentType: 'image/png', body: TILE_BASE }),
  );
}

/** Tormenta de ~46 km de radio sobre CDMX hace 10 min, que avanza hacia el este. */
function tormentaSobreElPunto(): EscenaRadar {
  return {
    dbz: tormentaQueAvanza({
      gx0: P.x,
      gy0: P.y,
      t0Ms: Date.now() - 10 * 60_000,
      vxPxMin: 0.4,
      vyPxMin: 0,
      radioPx: 40,
    }),
    cubierto: () => true,
  };
}

async function porcentaje(locator: Locator): Promise<number> {
  return Number.parseInt((await locator.textContent()) ?? '', 10);
}

test.describe('Fase 2: nowcast con radar (fixtures)', () => {
  test('con lluvia sobre el punto el radar sube la probabilidad y se ve el mapa', async ({
    page,
    context,
  }) => {
    await conGeolocalizacion(context);
    await conProveedores(page, { escena: tormentaSobreElPunto() });

    await page.goto('/');

    await expect(page.getByTestId('origen-pop')).toContainText(/radar/i);
    // El ensamble simulado no ve lluvia (~1 %): el 70 % viene del radar.
    expect(await porcentaje(page.getByTestId('pop-ahora'))).toBeGreaterThan(70);
    await expect(page.getByTestId('barra-pop-0')).toHaveAttribute('data-radar', 'si');
    await expect(page.getByText(/Radar RainViewer: ✓/)).toContainText(/avanza a \d+ km\/h hacia el este/);

    const mapa = page.getByTestId('mapa-radar');
    await expect(mapa).toBeVisible();
    await expect(mapa).toHaveClass(/leaflet-container/);
    await expect(page.getByLabel('Fotograma del radar')).toBeVisible();
  });

  test('el mapa muestra el fotograma más reciente y se puede animar y recorrer', async ({
    page,
    context,
  }) => {
    await conGeolocalizacion(context);
    await conProveedores(page, { escena: tormentaSobreElPunto() });
    await page.goto('/');

    const hora = page.getByTestId('hora-fotograma');
    await expect(page.getByText('(más reciente)')).toBeVisible();
    const reciente = await hora.textContent();

    await page.getByLabel('Fotograma del radar').fill('0');
    await expect(hora).not.toHaveText(reciente ?? '');
    await expect(page.getByText('(más reciente)')).toBeHidden();

    await page.getByRole('button', { name: 'Animar' }).click();
    await expect(page.getByRole('button', { name: 'Pausar' })).toHaveAttribute('aria-pressed', 'true');
    const inicial = await hora.textContent();
    await expect.poll(async () => hora.textContent(), { timeout: 10_000 }).not.toBe(inicial);
    await page.getByRole('button', { name: 'Pausar' }).click();
  });

  test('una banda de lluvia que se acerca aparece en las próximas horas', async ({ page, context }) => {
    await conGeolocalizacion(context);
    await conProveedores(page, {
      escena: {
        dbz: tormentaQueAvanza({
          gx0: P.x - 60,
          gy0: P.y,
          t0Ms: Date.now() - 10 * 60_000,
          vxPxMin: 0.5,
          vyPxMin: 0,
          radioPx: 40,
        }),
        cubierto: () => true,
      },
    });
    await page.goto('/');
    await expect(page.getByTestId('barra-pop-0')).toBeAttached();
    await expect(page.getByText(/Radar RainViewer: ✓/)).toBeVisible();

    const titulos = await page.locator('[data-testid^="barra-pop-"] title').allTextContents();
    const pops = titulos.slice(0, 4).map((t) => Number.parseInt(/(\d+) %/.exec(t)?.[1] ?? '0', 10));
    // Sin radar todas serían ~1 %; con la banda llegando alguna de las primeras horas sube.
    expect(Math.max(...pops)).toBeGreaterThan(25);
  });

  test('sin cobertura de radar se queda con el ensamble y no muestra el mapa', async ({
    page,
    context,
  }) => {
    await conGeolocalizacion(context);
    await conProveedores(page, { escena: { ...tormentaSobreElPunto(), cubierto: () => false } });
    await page.goto('/');

    await expect(page.getByText(/sin cobertura en esta zona/)).toBeVisible();
    await expect(page.getByTestId('pop-ahora')).toHaveText('1%');
    await expect(page.getByTestId('origen-pop')).toContainText(/ensamble/);
    await expect(page.getByTestId('mapa-radar')).toHaveCount(0);
  });

  test('con RainViewer caído el ensamble sigue y la fuente aparece como no disponible', async ({
    page,
    context,
  }) => {
    await conGeolocalizacion(context);
    await conProveedores(page, { indiceHttp: 503 });
    await page.goto('/');

    await expect(page.getByText(/Radar RainViewer: no disponible/)).toBeVisible();
    await expect(page.getByTestId('pop-ahora')).toBeVisible();
    await expect(page.getByTestId('mapa-radar')).toHaveCount(0);
    await expect(page.getByText(/No se pudo obtener el pronóstico/)).toHaveCount(0);
  });
});

test.describe('Fase 2: @vivo contra RainViewer real', () => {
  test('@vivo el índice trae frames y los tiles usan solo colores de la paleta', async ({ request }) => {
    let indice;
    try {
      const respuesta = await request.get('https://api.rainviewer.com/public/weather-maps.json');
      if (!respuesta.ok()) {
        test.skip(true, `RainViewer respondió ${respuesta.status()}`);
        return;
      }
      indice = await respuesta.json();
    } catch {
      test.skip(true, 'RainViewer no responde');
      return;
    }

    const frames = indice.radar.past as { time: number; path: string }[];
    expect(frames.length).toBeGreaterThanOrEqual(2);
    const ultimo = frames[frames.length - 1];
    // El servicio descarta frames de más de 40 min; con el radar sano el último es de hace < 30.
    expect(Date.now() / 1000 - ultimo.time).toBeLessThan(40 * 60);

    const tx = Math.floor(P.x / 256);
    const ty = Math.floor(P.y / 256);
    const tile = await request.get(`${indice.host}${ultimo.path}/256/${ZOOM}/${tx}/${ty}/2/0_0.png`);
    expect(tile.ok()).toBe(true);
    const imagen = decodificarPng(await tile.body());
    expect([imagen.ancho, imagen.alto]).toEqual([256, 256]);

    const conocidos = new Set(PALETA_OPACA.map(([, rgb]) => rgb));
    const desconocidos = new Set<number>();
    for (let i = 0; i < 256 * 256; i += 1) {
      if (imagen.rgba[i * 4 + 3] === 255) {
        const rgb = (imagen.rgba[i * 4] << 16) | (imagen.rgba[i * 4 + 1] << 8) | imagen.rgba[i * 4 + 2];
        if (!conocidos.has(rgb)) desconocidos.add(rgb);
      }
    }
    // Si RainViewer cambiara la paleta, aquí se nota antes que en producción.
    expect([...desconocidos].map((c) => c.toString(16))).toEqual([]);

    const cobertura = await request.get(`${indice.host}/v2/coverage/0/256/${ZOOM}/${tx}/${ty}/0/0_0.png`);
    expect(cobertura.ok()).toBe(true);
    expect(decodificarPng(await cobertura.body()).ancho).toBe(256);
  });

  test('@vivo la app decodifica los tiles reales en el canvas del navegador', async ({ page, context }) => {
    await conGeolocalizacion(context);
    // Ensamble y complemento simulados: aquí solo se prueba el radar real.
    await page.route('**/ensemble-api.open-meteo.com/**', (ruta) =>
      ruta.fulfill({ json: ensambleFixture({ inicio: inicioSerie() }) }),
    );
    await page.route('**/api.open-meteo.com/**', (ruta) =>
      ruta.fulfill({ json: forecastFixture(72, inicioSerie()) }),
    );
    await page.route('**/tile.openstreetmap.org/**', (ruta) =>
      ruta.fulfill({ contentType: 'image/png', body: TILE_BASE }),
    );

    await page.goto('/');
    const fuente = page.getByText(/Radar RainViewer:/);
    await expect(fuente).toBeVisible();
    await expect(fuente).not.toContainText('consultando', { timeout: 30_000 });

    const texto = (await fuente.textContent()) ?? '';
    if (/no disponible|se ignora/.test(texto)) {
      test.skip(true, `RainViewer no está sano: ${texto}`);
      return;
    }
    // CDMX tiene cobertura de radar y no debería caer en el error de decodificación.
    await expect(fuente).toContainText('✓');
    await expect(page.getByTestId('mapa-radar')).toBeVisible();
    expect(await porcentaje(page.getByTestId('pop-ahora'))).toBeLessThanOrEqual(100);
  });
});
