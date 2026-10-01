/**
 * Uso: pnpm capturas; CAPTURAS_ETIQUETA=antes pnpm capturas;
 * CAPTURAS_FILTRO='listo-alta__390' pnpm capturas.
 * PNG en reportes/.tmp/capturas/<etiqueta>/; reportes/.tmp está ignorado por git.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pixelGlobal } from '../../src/nowcast/tiles';
import { ensambleFixture, forecastFixture } from '../../tests/helpers/ensamble';
import { codificarPng } from '../../tests/helpers/png';
import {
  cargadorSintetico,
  indiceRadarFixture,
  tormentaQueAvanza,
  ZOOM,
  type EscenaRadar,
} from '../../tests/helpers/radar';

const AHORA = new Date('2026-10-01T02:36:00Z');
const INICIO = '2026-09-30T06:00';
const ZONA = { timezone: 'America/Mexico_City', offsetS: -21600 };
const CDMX = { latitude: 19.43, longitude: -99.13 };
const PUNTO = pixelGlobal({ lat: CDMX.latitude, lon: CDMX.longitude }, ZOOM);
const TILE_BASE = codificarPng(256, 256, new Uint8Array(256 * 256 * 4).fill(200));
const ANCHOS = [320, 390, 1280];
const TEMAS = ['claro', 'oscuro'] as const;
const ESTADOS = [
  'listo-alta', 'listo-media', 'listo-baja', 'listo-nula',
  'radar-lluvia', 'radar-desactualizado', 'radar-sin-cobertura',
  'solicitando', 'error', 'fuera-de-mexico', 'sin-ubicacion', 'busqueda',
] as const;
type Estado = (typeof ESTADOS)[number];

const PORCENTAJES: Partial<Record<Estado, number>> = {
  'listo-alta': 80, 'listo-media': 45, 'listo-baja': 15, 'listo-nula': 0,
};
const DIRECTORIO = join(
  fileURLToPath(new URL('../../reportes/.tmp/capturas/', import.meta.url)),
  process.env.CAPTURAS_ETIQUETA ?? 'actual',
);
const FILTRO = process.env.CAPTURAS_FILTRO ? new RegExp(process.env.CAPTURAS_FILTRO) : null;

function tormentaSobreElPunto(sinCobertura: boolean): EscenaRadar {
  return {
    dbz: tormentaQueAvanza({
      gx0: PUNTO.x,
      gy0: PUNTO.y,
      t0Ms: AHORA.getTime() - 10 * 60_000,
      vxPxMin: 0.4,
      vyPxMin: 0,
      radioPx: 40,
    }),
    cubierto: () => !sinCobertura,
  };
}

async function prepararUbicacion(page: Page, context: BrowserContext, estado: Estado): Promise<void> {
  if (estado === 'sin-ubicacion' || estado === 'busqueda') {
    await context.clearPermissions();
    await page.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_exito, error) => {
        error?.({
          code: 1, message: 'denegado', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3,
        } as GeolocationPositionError);
      };
    });
    return;
  }
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(
    estado === 'fuera-de-mexico' ? { latitude: 40.42, longitude: -3.7 } : CDMX,
  );
}

async function conProveedores(page: Page, estado: Estado): Promise<void> {
  await page.route('**/*', (ruta) =>
    new URL(ruta.request().url()).origin === 'http://localhost:4174'
      ? ruta.continue()
      : ruta.abort(),
  );
  await page.route('**/ensemble-api.open-meteo.com/**', async (ruta) => {
    if (estado === 'solicitando') {
      await new Promise<void>((resolve) => setTimeout(resolve, 4_000));
      if (page.isClosed()) {
        return;
      }
    }
    if (estado === 'error') {
      await ruta.fulfill({ status: 500, json: { error: 'Ensamble no disponible' } });
      return;
    }
    await ruta.fulfill({
      json: ensambleFixture({
        inicio: INICIO,
        ...ZONA,
        precipitacion: (m, h) => {
          const porcentaje = h === 21 || h === 22
            ? (PORCENTAJES[estado] ?? 0)
            : h === 27 || h === 28 ? 15 : 0;
          // Reparte los miembros mojados entre modelos de diferente tamaño.
          const fraccion = porcentaje / 100;
          return Math.round((m + 1) * fraccion) > Math.round(m * fraccion) ? 1 : 0;
        },
      }),
    });
  });
  await page.route('**/api.open-meteo.com/**', (ruta) =>
    ruta.fulfill({ json: forecastFixture(72, INICIO, ZONA) }),
  );
  const conRadar = estado.startsWith('radar-');
  await page.route('**/api.rainviewer.com/**', (ruta) =>
    ruta.fulfill({
      json: indiceRadarFixture({
        ahoraMs: AHORA.getTime(),
        numFrames: conRadar ? 13 : 0,
        edadUltimoMin: estado === 'radar-desactualizado' ? 60 : 10,
      }),
    }),
  );
  const cargar = cargadorSintetico(tormentaSobreElPunto(estado === 'radar-sin-cobertura'));
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
  await page.route('**/geocoding-api.open-meteo.com/**', (ruta) =>
    ruta.fulfill({
      json: {
        results: [{ name: 'Guadalajara', latitude: 20.67, longitude: -103.35, admin1: 'Jalisco' }],
      },
    }),
  );
}

async function esperarEstado(page: Page, estado: Estado): Promise<void> {
  if (estado === 'solicitando') {
    await expect(page.getByRole('status')).toContainText('Obteniendo pronóstico…');
    await page.waitForTimeout(400);
    await expect(page.getByRole('status')).toContainText('Obteniendo pronóstico…');
  } else if (estado === 'error' || estado === 'fuera-de-mexico') {
    await expect(page.getByRole('alert')).toContainText(
      estado === 'error' ? 'No se pudo obtener el pronóstico' : 'fuera de México',
    );
  } else if (estado === 'sin-ubicacion' || estado === 'busqueda') {
    await expect(page.getByLabel('Nombre de la ciudad')).toBeVisible();
    if (estado === 'busqueda') {
      await page.getByLabel('Nombre de la ciudad').fill('Guadalajara');
      await page.getByRole('button', { name: 'Buscar', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Guadalajara, Jalisco' })).toBeVisible();
    }
  } else {
    await expect(page.getByTestId('pop-ahora')).toBeVisible();
    if (estado === 'radar-lluvia') {
      await expect(page.getByTestId('origen-pop')).toContainText(/radar/i);
      await expect(page.getByTestId('mapa-radar')).toBeVisible();
      await expect(page.getByTestId('hora-fotograma')).toBeVisible();
    } else if (estado === 'radar-desactualizado') {
      await expect(page.getByText(/Radar RainViewer:/)).toContainText('se ignora');
    } else if (estado === 'radar-sin-cobertura') {
      await expect(page.getByText(/Radar RainViewer:/)).toContainText('sin cobertura');
    } else {
      await expect(page.getByText(/Radar RainViewer:/)).toContainText('no disponible');
      const mostrado = Number.parseInt((await page.getByTestId('pop-ahora').textContent()) ?? '', 10);
      expect(Math.abs(mostrado - (PORCENTAJES[estado] ?? 0))).toBeLessThanOrEqual(4);
    }
  }
  if (await page.getByTestId('mapa-radar').count() > 0) {
    await esperarTiles(page);
  }
  await page.evaluate(() => document.fonts.ready);
  if (estado !== 'solicitando') {
    await page.waitForTimeout(200);
  }
}

async function esperarTiles(page: Page): Promise<void> {
  try {
    await page.waitForFunction(() => {
      const imagenes = Array.from(document.querySelectorAll<HTMLImageElement>(
        '[data-testid="mapa-radar"] .leaflet-tile-pane img',
      ));
      return imagenes.some((imagen) => imagen.src.includes('/v2/radar/'))
        && imagenes.some((imagen) => !imagen.src.includes('/v2/radar/'))
        && imagenes.every((imagen) => imagen.complete && imagen.naturalWidth > 0);
    }, undefined, { timeout: 15_000 });
  } catch (causa) {
    throw new Error('No cargaron todos los tiles del mapa base y del radar en 15 s; captura cancelada', {
      cause: causa,
    });
  }
  // Leaflet aplica la opacidad después de completar las imágenes.
  await page.waitForTimeout(300);
}

async function medirRadarVisible(page: Page, captura: Buffer, nombre: string): Promise<void> {
  const region = await page.getByTestId('mapa-radar').evaluate((mapa) => {
    const rectangulo = mapa.getBoundingClientRect();
    // Excluye el logo amarillo de Leaflet en la atribución, que daría un falso positivo.
    return {
      x: rectangulo.x + window.scrollX + 20,
      y: rectangulo.y + window.scrollY + 20,
      ancho: rectangulo.width - 40,
      alto: rectangulo.height - 40,
    };
  });
  const pixeles = await page.evaluate(async ({ imagen, regionMapa }) => {
    const png = new Image();
    png.src = `data:image/png;base64,${imagen}`;
    await png.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(regionMapa.ancho);
    canvas.height = Math.ceil(regionMapa.alto);
    const contexto = canvas.getContext('2d');
    if (!contexto) {
      throw new Error('No se pudo leer la región del mapa de la captura PNG');
    }
    contexto.drawImage(
      png, regionMapa.x, regionMapa.y, regionMapa.ancho, regionMapa.alto,
      0, 0, canvas.width, canvas.height,
    );
    const { data } = contexto.getImageData(0, 0, canvas.width, canvas.height);
    let amarillos = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      // El eco de 35 dBZ es amarillo; gris, marcador rojo y controles no cumplen esto.
      if (r > b + 50 && g > b + 50 && Math.abs(r - g) < 60) {
        amarillos += 1;
      }
    }
    return amarillos;
  }, { imagen: captura.toString('base64'), regionMapa: region });
  console.log(`${nombre}: ${pixeles} píxeles amarillos de tormenta dentro del mapa en el PNG`);
  expect(
    pixeles, `El PNG ${nombre} debe mostrar la tormenta, no solo mapa gris y marcador`,
  ).toBeGreaterThan(0);
}

for (const estado of ESTADOS) {
  for (const ancho of ANCHOS) {
    for (const tema of TEMAS) {
      const nombre = `${estado}__${ancho}__${tema}`;
      test(nombre, async ({ page, context }) => {
        test.skip(FILTRO !== null && !FILTRO.test(nombre), 'No coincide con CAPTURAS_FILTRO');
        await mkdir(DIRECTORIO, { recursive: true });
        await page.setViewportSize({ width: ancho, height: 900 });
        await page.emulateMedia({ colorScheme: tema === 'claro' ? 'light' : 'dark' });
        if (estado === 'radar-lluvia') {
          // Leaflet necesita que Date.now avance para completar el fade de los tiles.
          await page.clock.install({ time: AHORA });
        } else {
          await page.clock.setFixedTime(AHORA);
        }
        await prepararUbicacion(page, context, estado);
        await conProveedores(page, estado);
        await page.goto('/');
        await esperarEstado(page, estado);
        if (estado === 'radar-lluvia') {
          await expect(page.locator('.cielo__hora')).toHaveText('Ahora · 20:00 a 21:00 h');
        }
        const captura = await page.screenshot({ path: join(DIRECTORIO, `${nombre}.png`), fullPage: true });
        if (estado === 'radar-lluvia') {
          await medirRadarVisible(page, captura, nombre);
        }
      });
    }
  }
}
