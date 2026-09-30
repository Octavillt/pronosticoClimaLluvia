import type { TileRgba } from '../domain/types';
import { PALETA_OPACA, PALETA_TENUE } from './paleta';

/** Valor de dBZ de un píxel sin eco. */
export const SIN_ECO = -32;

const COLOR_A_DBZ = new Map<number, number>(PALETA_OPACA.map(([dbz, rgb]) => [rgb, dbz]));

/** Para cada alfa 1–254, el dBZ del eco tenue cuyo alfa es más cercano. */
const ALFA_A_DBZ = (() => {
  const tabla = new Int8Array(256).fill(SIN_ECO);
  for (let alfa = 1; alfa < 255; alfa += 1) {
    let mejor = PALETA_TENUE[0];
    for (const entrada of PALETA_TENUE) {
      if (Math.abs(entrada[1] - alfa) < Math.abs(mejor[1] - alfa)) {
        mejor = entrada;
      }
    }
    tabla[alfa] = mejor[0];
  }
  return tabla;
})();

/** Memoria de colores fuera de la paleta; se vacía si crece de más (no debería pasar). */
const cercanos = new Map<number, number>();
const MAX_COLORES_MEMORIZADOS = 4096;

function dbzDeColorDesconocido(rgb: number): number {
  const memo = cercanos.get(rgb);
  if (memo !== undefined) {
    return memo;
  }
  const r = (rgb >> 16) & 255;
  const g = (rgb >> 8) & 255;
  const b = rgb & 255;
  let mejorDbz = SIN_ECO;
  let mejorDistancia = Number.POSITIVE_INFINITY;
  for (const [dbz, color] of PALETA_OPACA) {
    const dr = r - ((color >> 16) & 255);
    const dg = g - ((color >> 8) & 255);
    const db = b - (color & 255);
    const distancia = dr * dr + dg * dg + db * db;
    if (distancia < mejorDistancia) {
      mejorDistancia = distancia;
      mejorDbz = dbz;
    }
  }
  if (cercanos.size >= MAX_COLORES_MEMORIZADOS) {
    cercanos.clear();
  }
  cercanos.set(rgb, mejorDbz);
  return mejorDbz;
}

/**
 * Convierte un tile de RainViewer (paleta Universal Blue) a dBZ por píxel.
 * Los píxeles opacos se buscan por color exacto; si no coincide ninguno (por ejemplo tras un
 * remuestreo), se toma el color más cercano. Los semitransparentes son ecos tenues y se
 * distinguen solo por el alfa.
 */
export function decodificarTile(tile: TileRgba): Float32Array {
  const total = tile.ancho * tile.alto;
  const dbz = new Float32Array(total);
  const { data } = tile;
  for (let i = 0; i < total; i += 1) {
    const alfa = data[i * 4 + 3];
    if (alfa === 0) {
      dbz[i] = SIN_ECO;
    } else if (alfa < 255) {
      dbz[i] = ALFA_A_DBZ[alfa];
    } else {
      const rgb = (data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2];
      dbz[i] = COLOR_A_DBZ.get(rgb) ?? dbzDeColorDesconocido(rgb);
    }
  }
  return dbz;
}

/** Máscara de cobertura: 1 donde hay radar (transparente), 0 donde no (negro). */
export function decodificarCobertura(tile: TileRgba): Uint8Array {
  const total = tile.ancho * tile.alto;
  const mascara = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    mascara[i] = tile.data[i * 4 + 3] < 128 ? 1 : 0;
  }
  return mascara;
}

type ArregloNumerico = Float32Array | Uint8Array;

/**
 * Pega hasta 9 tiles (por filas) en un mosaico. Un tile `null` deja su zona con `relleno`.
 */
export function ensamblarMosaico<T extends ArregloNumerico>(
  tiles: (T | null)[],
  ladoTile: number,
  crear: (longitud: number) => T,
  relleno: number,
): T {
  const lado = ladoTile * 3;
  const mosaico = crear(lado * lado);
  mosaico.fill(relleno);
  tiles.forEach((tile, indice) => {
    if (!tile) {
      return;
    }
    const columna = indice % 3;
    const fila = Math.floor(indice / 3);
    for (let y = 0; y < ladoTile; y += 1) {
      const origen = y * ladoTile;
      const destino = (fila * ladoTile + y) * lado + columna * ladoTile;
      mosaico.set(tile.subarray(origen, origen + ladoTile), destino);
    }
  });
  return mosaico;
}
