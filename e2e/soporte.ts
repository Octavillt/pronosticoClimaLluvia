import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { ensambleFixture, forecastFixture } from '../tests/helpers/ensamble';
import { codificarPng } from '../tests/helpers/png';
import { cargadorSintetico, indiceRadarFixture } from '../tests/helpers/radar';

// Apoyo compartido por las pruebas de tema y de diseño adaptable: proveedores simulados sin internet,
// recolección de errores de consola y lectura de tokens y contraste.

export const ORIGEN = 'http://localhost:4173';
export const CDMX = { latitude: 19.43, longitude: -99.13 };
export const MADRID = { latitude: 40.42, longitude: -3.7 };

const TILE_BASE = codificarPng(256, 256, new Uint8Array(256 * 256 * 4).fill(200));

export type Ubicacion = 'cdmx' | 'madrid' | 'denegada';

export interface OpcionesPagina {
  radar?: boolean;
  ubicacion?: Ubicacion;
  ensambleFalla?: boolean;
}

export interface Pagina {
  /** Solicitudes de red que no son del propio sitio (deberían ser solo proveedores simulados). */
  solicitudes: string[];
  /** `console.error` y `pageerror` ocurridos durante la prueba. */
  errores: string[];
}

export async function preparar(
  page: Page,
  context: BrowserContext,
  { radar = false, ubicacion = 'cdmx', ensambleFalla = false }: OpcionesPagina = {},
): Promise<Pagina> {
  const pagina: Pagina = { solicitudes: [], errores: [] };
  page.on('console', (mensaje) => {
    if (mensaje.type() === 'error') pagina.errores.push(mensaje.text());
  });
  page.on('pageerror', (error) => pagina.errores.push(String(error)));
  page.on('request', (solicitud) => {
    if (new URL(solicitud.url()).origin !== ORIGEN) pagina.solicitudes.push(solicitud.url());
  });

  if (ubicacion === 'denegada') {
    await context.clearPermissions();
    await page.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_exito, error) => {
        error?.({
          code: 1, message: 'denegado', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3,
        } as GeolocationPositionError);
      };
    });
  } else {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(ubicacion === 'madrid' ? MADRID : CDMX);
  }

  const inicio = new Date(Date.now() - 6 * 3_600_000);
  inicio.setUTCMinutes(0, 0, 0);
  const hora = inicio.toISOString().slice(0, 16);
  // Lo no simulado se bloquea para que ninguna prueba dependa de internet.
  await page.route('**/*', (ruta) =>
    new URL(ruta.request().url()).origin === ORIGEN ? ruta.continue() : ruta.abort(),
  );
  await page.route('**/ensemble-api.open-meteo.com/**', (ruta) =>
    ensambleFalla
      ? ruta.fulfill({ status: 500, json: { error: 'Ensamble no disponible' } })
      : ruta.fulfill({ json: ensambleFixture({ inicio: hora }) }),
  );
  await page.route('**/api.open-meteo.com/**', (ruta) =>
    ruta.fulfill({ json: forecastFixture(72, hora) }),
  );
  await page.route('**/api.rainviewer.com/**', (ruta) =>
    ruta.fulfill({ json: indiceRadarFixture({ numFrames: radar ? 3 : 0 }) }),
  );
  const cargar = cargadorSintetico({ dbz: () => null, cubierto: () => true });
  await page.route('**/tilecache.rainviewer.com/**', async (ruta) => {
    const tile = await cargar(ruta.request().url());
    await ruta.fulfill({ contentType: 'image/png', body: codificarPng(tile.ancho, tile.alto, tile.data) });
  });
  await page.route('**/tile.openstreetmap.org/**', (ruta) =>
    ruta.fulfill({ contentType: 'image/png', body: TILE_BASE }),
  );
  await page.route('**/geocoding-api.open-meteo.com/**', (ruta) =>
    ruta.fulfill({
      json: {
        results: [
          { name: 'Guadalajara', latitude: 20.67, longitude: -103.35, admin1: 'Jalisco' },
          { name: 'Guadalupe', latitude: 25.68, longitude: -100.25, admin1: 'Nuevo León' },
        ],
      },
    }),
  );
  return pagina;
}

type Tema = 'claro' | 'oscuro';

/** Variables de `src/estilos/tokens.css`: el bloque `:root` es el tema claro y el oscuro lo sobrescribe. */
export function leerTokens(): Record<Tema, Record<string, string>> {
  const css = readFileSync(join(process.cwd(), 'src', 'estilos', 'tokens.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const extraer = (bloque: string) => Object.fromEntries(
    [...bloque.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
  const claro = extraer(/^\s*:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '');
  const oscuro = extraer(
    /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '',
  );
  return { claro, oscuro: { ...claro, ...oscuro } };
}

/** `#1e4f8f` → `rgb(30, 79, 143)`, el formato de `getComputedStyle`. */
export function hexARgb(hex: string): string {
  const canales = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${canales.join(', ')})`;
}

function canales(color: string): [number, number, number, number] {
  const numeros = /rgba?\(([^)]+)\)/.exec(color)?.[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (!numeros || numeros.length < 3) throw new Error(`Color no reconocido: ${color}`);
  return [numeros[0], numeros[1], numeros[2], numeros[3] ?? 1];
}

function luminancia([r, g, b]: [number, number, number, number]): number {
  const [rl, gl, bl] = [r, g, b].map((c) => {
    const canal = c / 255;
    return canal <= 0.04045 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

/** Razón de contraste WCAG 2.x entre dos colores `rgb(...)` opacos. */
export function razonContraste(a: string, b: string): number {
  const [la, lb] = [luminancia(canales(a)), luminancia(canales(b))];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Color del texto de un elemento y el fondo opaco efectivo (el primer ancestro con fondo). */
export async function colorYFondo(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((elemento) => {
    const color = getComputedStyle(elemento).color;
    let nodo: Element | null = elemento;
    while (nodo) {
      const fondo = getComputedStyle(nodo).backgroundColor;
      if (fondo !== 'rgba(0, 0, 0, 0)' && fondo !== 'transparent') return { color, fondo };
      nodo = nodo.parentElement;
    }
    return { color, fondo: getComputedStyle(document.body).backgroundColor };
  });
}

export async function sinDesbordamiento(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}
