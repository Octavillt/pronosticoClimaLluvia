import type { TileRgba } from '../../src/domain/types';
import { PALETA_OPACA } from '../../src/nowcast/paleta';

export const LADO = 256;
export const ZOOM = 7;

/** Colores oficiales de la paleta Universal Blue, escritos a mano a partir del CSV de RainViewer. */
export const COLORES_OFICIALES = {
  15: [0x88, 0xdd, 0xee, 255],
  20: [0x00, 0xa3, 0xe0, 255],
  35: [0xff, 0xee, 0x00, 255],
  50: [0xc1, 0x00, 0x00, 255],
  65: [0xff, 0xff, 0xff, 255],
  75: [0x00, 0xff, 0x00, 255],
} as const;

type Rgba = readonly [number, number, number, number];

/** Color de la paleta para un dBZ (el tramo más alto que no lo supere); `null` bajo 15 dBZ. */
export function colorDeDbz(dbz: number): Rgba | null {
  let elegido: readonly [number, number] | null = null;
  for (const entrada of PALETA_OPACA) {
    if (entrada[0] <= dbz) {
      elegido = entrada;
    }
  }
  if (!elegido) {
    return null;
  }
  const rgb = elegido[1];
  return [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, 255];
}

export function tileDesde(ancho: number, alto: number, pintar: (x: number, y: number) => Rgba | null): TileRgba {
  const data = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y += 1) {
    for (let x = 0; x < ancho; x += 1) {
      const color = pintar(x, y);
      if (color) {
        data.set(color, (y * ancho + x) * 4);
      }
    }
  }
  return { data, ancho, alto };
}

/** Campo de dBZ (Float32) con un disco de intensidad constante. */
export function campoConDisco(
  lado: number,
  cx: number,
  cy: number,
  radio: number,
  dbz: number,
  fondo = -32,
): Float32Array {
  const campo = new Float32Array(lado * lado).fill(fondo);
  for (let y = 0; y < lado; y += 1) {
    for (let x = 0; x < lado; x += 1) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= radio * radio) {
        campo[y * lado + x] = dbz;
      }
    }
  }
  return campo;
}

export function coberturaTotal(lado: number, valor = 1): Uint8Array {
  return new Uint8Array(lado * lado).fill(valor);
}

export function indiceRadarFixture(opciones: {
  ahoraMs?: number;
  numFrames?: number;
  edadUltimoMin?: number;
  host?: string;
}) {
  const ahoraS = Math.floor((opciones.ahoraMs ?? Date.now()) / 1000);
  const numFrames = opciones.numFrames ?? 13;
  const ultimoS = ahoraS - (opciones.edadUltimoMin ?? 10) * 60;
  return {
    version: '2.0',
    generated: ahoraS,
    host: opciones.host ?? 'https://tilecache.rainviewer.com',
    radar: {
      past: Array.from({ length: numFrames }, (_, i) => {
        const tiempo = ultimoS - (numFrames - 1 - i) * 600;
        return { time: tiempo, path: `/v2/radar/f${tiempo}` };
      }),
      nowcast: [],
    },
  };
}

export interface EscenaRadar {
  /** dBZ en el píxel global (gx, gy) al instante `tMs`, o `null` si no hay eco. */
  dbz: (tMs: number, gx: number, gy: number) => number | null;
  /** Si el píxel global tiene cobertura de radar. */
  cubierto: (gx: number, gy: number) => boolean;
}

const RE_RADAR = /\/v2\/radar\/f(\d+)\/256\/(\d+)\/(\d+)\/(\d+)\/\d+\/\d+_\d+\.png$/;
const RE_COBERTURA = /\/v2\/coverage\/0\/256\/(\d+)\/(\d+)\/(\d+)\/0\/0_0\.png$/;

/** Cargador de tiles que renderiza la escena en lugar de ir a la red. */
export function cargadorSintetico(escena: EscenaRadar, registro?: string[]) {
  return async (url: string): Promise<TileRgba> => {
    registro?.push(url);
    const radar = RE_RADAR.exec(url);
    // La escena está en píxeles globales de zoom 7; a otros zooms (Leaflet los pide al alejar) no hay nada.
    if (radar && Number(radar[2]) !== ZOOM) {
      return tileDesde(LADO, LADO, () => null);
    }
    if (radar) {
      const tMs = Number(radar[1]) * 1000;
      const [tx, ty] = [Number(radar[3]), Number(radar[4])];
      return tileDesde(LADO, LADO, (x, y) => {
        const dbz = escena.dbz(tMs, tx * LADO + x, ty * LADO + y);
        return dbz === null ? null : colorDeDbz(dbz);
      });
    }
    const cobertura = RE_COBERTURA.exec(url);
    if (cobertura && Number(cobertura[1]) !== ZOOM) {
      return tileDesde(LADO, LADO, () => [255, 255, 255, 0]);
    }
    if (cobertura) {
      const [tx, ty] = [Number(cobertura[2]), Number(cobertura[3])];
      return tileDesde(LADO, LADO, (x, y) =>
        escena.cubierto(tx * LADO + x, ty * LADO + y) ? [255, 255, 255, 0] : [0, 0, 0, 255],
      );
    }
    throw new Error(`URL de tile inesperada: ${url}`);
  };
}

/** Tormenta circular que avanza a velocidad constante (píxeles globales por minuto). */
export function tormentaQueAvanza(opciones: {
  /** Centro al instante `t0Ms`. */
  gx0: number;
  gy0: number;
  t0Ms: number;
  vxPxMin: number;
  vyPxMin: number;
  radioPx: number;
  dbz?: number;
}): EscenaRadar['dbz'] {
  const { gx0, gy0, t0Ms, vxPxMin, vyPxMin, radioPx, dbz = 35 } = opciones;
  return (tMs, gx, gy) => {
    const minutos = (tMs - t0Ms) / 60_000;
    const dx = gx + 0.5 - (gx0 + vxPxMin * minutos);
    const dy = gy + 0.5 - (gy0 + vyPxMin * minutos);
    return dx * dx + dy * dy <= radioPx * radioPx ? dbz : null;
  };
}
