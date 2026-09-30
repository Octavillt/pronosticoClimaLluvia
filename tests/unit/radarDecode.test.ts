import { describe, expect, test } from 'vitest';
import {
  decodificarCobertura,
  decodificarTile,
  ensamblarMosaico,
  SIN_ECO,
} from '../../src/nowcast/radarDecode';
import { COLORES_OFICIALES, tileDesde } from '../helpers/radar';

function unPixel(r: number, g: number, b: number, a: number) {
  return tileDesde(1, 1, () => [r, g, b, a]);
}

describe('decodificarTile', () => {
  test.each(Object.entries(COLORES_OFICIALES))(
    'el color oficial de %s dBZ se decodifica a %s dBZ',
    (dbz, [r, g, b, a]) => {
      expect(decodificarTile(unPixel(r, g, b, a))[0]).toBe(Number(dbz));
    },
  );

  test('un píxel transparente es "sin eco"', () => {
    expect(decodificarTile(unPixel(255, 255, 255, 0))[0]).toBe(SIN_ECO);
  });

  test('los ecos tenues se distinguen por el alfa', () => {
    expect(decodificarTile(unPixel(99, 97, 89, 20))[0]).toBe(-10);
    expect(decodificarTile(unPixel(146, 136, 113, 100))[0]).toBe(5);
    expect(decodificarTile(unPixel(222, 208, 151, 190))[0]).toBe(14);
  });

  test('un color opaco fuera de la paleta toma el más cercano', () => {
    expect(decodificarTile(unPixel(2, 160, 222, 255))[0]).toBe(20);
    expect(decodificarTile(unPixel(250, 236, 4, 255))[0]).toBe(35);
  });

  test('decodifica cada píxel del tile en su posición', () => {
    const tile = tileDesde(2, 2, (x, y) => (x === 1 && y === 0 ? [0xc1, 0, 0, 255] : null));
    expect(Array.from(decodificarTile(tile))).toEqual([SIN_ECO, 50, SIN_ECO, SIN_ECO]);
  });
});

describe('decodificarCobertura', () => {
  test('transparente = cubierto; opaco negro = sin cobertura', () => {
    const tile = tileDesde(4, 1, (x) => [[255, 255, 255, 0], [0, 0, 0, 255], [255, 255, 255, 127], [0, 0, 0, 128]][x] as [number, number, number, number]);
    expect(Array.from(decodificarCobertura(tile))).toEqual([1, 0, 1, 0]);
  });
});

describe('ensamblarMosaico', () => {
  const crear = (n: number) => new Float32Array(n);

  test('coloca cada tile en su fila y columna', () => {
    const tiles = Array.from({ length: 9 }, (_, i) => new Float32Array(4).fill(i + 1));
    const mosaico = ensamblarMosaico(tiles, 2, crear, 0);
    expect(mosaico).toHaveLength(36);
    // Primera fila del mosaico: tiles 1, 2 y 3 (cada uno de 2 píxeles de ancho).
    expect(Array.from(mosaico.slice(0, 6))).toEqual([1, 1, 2, 2, 3, 3]);
    // Tercera fila de píxeles = primera fila del tile 4, 5 y 6.
    expect(Array.from(mosaico.slice(12, 18))).toEqual([4, 4, 5, 5, 6, 6]);
    expect(Array.from(mosaico.slice(30, 36))).toEqual([7, 7, 8, 8, 9, 9]);
  });

  test('un tile null deja su zona con el valor de relleno', () => {
    const tiles: (Float32Array | null)[] = Array.from({ length: 9 }, () => new Float32Array(4).fill(7));
    tiles[4] = null;
    const mosaico = ensamblarMosaico(tiles, 2, crear, SIN_ECO);
    expect(mosaico[2 * 6 + 2]).toBe(SIN_ECO);
    expect(mosaico[3 * 6 + 3]).toBe(SIN_ECO);
    expect(mosaico[0]).toBe(7);
    expect(mosaico[5 * 6 + 5]).toBe(7);
  });

  test('sirve también para máscaras de cobertura (Uint8Array)', () => {
    const mascara = ensamblarMosaico<Uint8Array>(
      [new Uint8Array(4).fill(1), ...Array<null>(8).fill(null)],
      2,
      (n) => new Uint8Array(n),
      0,
    );
    expect(Array.from(mascara.slice(0, 6))).toEqual([1, 1, 0, 0, 0, 0]);
  });
});
