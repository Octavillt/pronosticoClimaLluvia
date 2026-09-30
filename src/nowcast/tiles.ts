import type { GeoPoint } from '../domain/types';

export const LADO_TILE = 256;
/** Resolución del mapa a zoom 0 en el ecuador (m/px) con tiles de 256 px. */
const METROS_POR_PIXEL_ZOOM_0 = 156_543.03392;

export interface PixelGlobal {
  x: number;
  y: number;
}

/** Píxel del mapa Web Mercator completo (`256 · 2^zoom` de lado) que corresponde a un punto. */
export function pixelGlobal(punto: GeoPoint, zoom: number): PixelGlobal {
  const lado = LADO_TILE * 2 ** zoom;
  const senLat = Math.sin((punto.lat * Math.PI) / 180);
  return {
    x: ((punto.lon + 180) / 360) * lado,
    y: (0.5 - Math.log((1 + senLat) / (1 - senLat)) / (4 * Math.PI)) * lado,
  };
}

export function metrosPorPixel(lat: number, zoom: number): number {
  return (METROS_POR_PIXEL_ZOOM_0 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

export interface TileMosaico {
  tx: number;
  ty: number;
  /** Posición (0–2) dentro del mosaico de 3×3. */
  columna: number;
  fila: number;
  /** Falso si el tile cae fuera del mundo; no se debe pedir. */
  valido: boolean;
}

export interface DisposicionMosaico {
  zoom: number;
  /** Lado del mosaico en píxeles (3 tiles). */
  lado: number;
  /** Posición del punto dentro del mosaico, con decimales. */
  puntoX: number;
  puntoY: number;
  tiles: TileMosaico[];
  /** Tile que contiene al punto (el central). */
  central: TileMosaico;
}

/** Mosaico de 3×3 tiles centrado en el tile que contiene al punto. */
export function disposicionMosaico(punto: GeoPoint, zoom: number): DisposicionMosaico {
  const pixel = pixelGlobal(punto, zoom);
  const tx = Math.floor(pixel.x / LADO_TILE);
  const ty = Math.floor(pixel.y / LADO_TILE);
  const maximo = 2 ** zoom - 1;

  const tiles: TileMosaico[] = [];
  for (let fila = 0; fila < 3; fila += 1) {
    for (let columna = 0; columna < 3; columna += 1) {
      const x = tx + columna - 1;
      const y = ty + fila - 1;
      tiles.push({ tx: x, ty: y, columna, fila, valido: x >= 0 && x <= maximo && y >= 0 && y <= maximo });
    }
  }

  return {
    zoom,
    lado: LADO_TILE * 3,
    puntoX: pixel.x - (tx - 1) * LADO_TILE,
    puntoY: pixel.y - (ty - 1) * LADO_TILE,
    tiles,
    central: tiles[4],
  };
}
