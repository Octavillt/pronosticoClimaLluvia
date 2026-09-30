import { describe, expect, test } from 'vitest';
import { disposicionMosaico, LADO_TILE, metrosPorPixel, pixelGlobal } from '../../src/nowcast/tiles';

describe('tiles', () => {
  test('el origen (0°, 0°) cae en el centro del mapa', () => {
    expect(pixelGlobal({ lat: 0, lon: 0 }, 1)).toEqual({ x: 256, y: 256 });
  });

  test('CDMX cae en el tile 28/56 a zoom 7', () => {
    const pixel = pixelGlobal({ lat: 19.43, lon: -99.13 }, 7);
    expect(pixel.x).toBeCloseTo(7361, 0);
    expect(pixel.y).toBeCloseTo(14580.5, 0);
    expect(Math.floor(pixel.x / LADO_TILE)).toBe(28);
    expect(Math.floor(pixel.y / LADO_TILE)).toBe(56);
  });

  test('metros por píxel: 156543 m en el ecuador a zoom 0 y menos al alejarse', () => {
    expect(metrosPorPixel(0, 0)).toBeCloseTo(156_543.03, 1);
    expect(metrosPorPixel(0, 7)).toBeCloseTo(1_222.99, 1);
    expect(metrosPorPixel(19.43, 7)).toBeCloseTo(1_153.4, 0);
    expect(metrosPorPixel(60, 7)).toBeCloseTo(metrosPorPixel(0, 7) / 2, 3);
  });

  test('el mosaico tiene 9 tiles por filas, con el del punto al centro', () => {
    const mosaico = disposicionMosaico({ lat: 19.43, lon: -99.13 }, 7);
    expect(mosaico.tiles).toHaveLength(9);
    expect(mosaico.central).toBe(mosaico.tiles[4]);
    expect(mosaico.central).toMatchObject({ tx: 28, ty: 56, columna: 1, fila: 1, valido: true });
    expect(mosaico.tiles[0]).toMatchObject({ tx: 27, ty: 55, columna: 0, fila: 0 });
    expect(mosaico.tiles[8]).toMatchObject({ tx: 29, ty: 57, columna: 2, fila: 2 });
    expect(mosaico.lado).toBe(768);
  });

  test('el punto queda dentro del tile central del mosaico', () => {
    const mosaico = disposicionMosaico({ lat: 19.43, lon: -99.13 }, 7);
    expect(mosaico.puntoX).toBeGreaterThanOrEqual(256);
    expect(mosaico.puntoX).toBeLessThan(512);
    expect(mosaico.puntoY).toBeGreaterThanOrEqual(256);
    expect(mosaico.puntoY).toBeLessThan(512);
    expect(mosaico.puntoX).toBeCloseTo(7361 - 27 * 256, 0);
  });

  test('los tiles fuera del mundo se marcan como inválidos', () => {
    const mosaico = disposicionMosaico({ lat: 0, lon: -179.9 }, 2);
    expect(mosaico.central.tx).toBe(0);
    expect(mosaico.tiles.filter((t) => t.columna === 0).every((t) => !t.valido)).toBe(true);
    expect(mosaico.tiles.filter((t) => t.columna > 0).every((t) => t.valido)).toBe(true);
  });
});
