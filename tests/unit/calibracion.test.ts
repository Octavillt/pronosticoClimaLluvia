import { describe, expect, test } from 'vitest';
import { config } from '../../src/config';
import type { ParVerificado } from '../../src/domain/types';
import {
  ajustarIsotonica,
  aplicarIsotonica,
  calibrarPop,
  calibrarSerie,
  construirCalibracion,
  type Calibracion,
  type ModeloIsotonico,
} from '../../src/services/calibracion';
import { MS_HORA } from '../../src/utils/horas';

const AHORA = Date.parse('2026-09-30T18:30:00Z');

function par(horizonteH: number, pop: number, observado: 0 | 1): ParVerificado {
  return { horizonteH, pop, popEnsamble: pop, pesoRadar: 0, observado };
}

describe('ajustarIsotonica', () => {
  test('vacío devuelve un modelo sin puntos', () => {
    expect(ajustarIsotonica([])).toEqual({ puntos: [], n: 0 });
  });

  test('el resultado nunca decrece', () => {
    const datos = [
      { x: 0.1, y: 0.9 },
      { x: 0.2, y: 0.1 },
      { x: 0.3, y: 0.8 },
      { x: 0.4, y: 0.2 },
      { x: 0.5, y: 0.7 },
      { x: 0.9, y: 0.6 },
    ];
    const { puntos } = ajustarIsotonica(datos);
    for (let i = 1; i < puntos.length; i += 1) {
      expect(puntos[i].y).toBeGreaterThanOrEqual(puntos[i - 1].y);
      expect(puntos[i].x).toBeGreaterThan(puntos[i - 1].x);
    }
  });

  test('PAV agrupa las violaciones en un solo bloque con la media', () => {
    // y = 1, 0, 0 con x creciente: se juntan en un punto (0.2, 1/3).
    const { puntos, n } = ajustarIsotonica([
      { x: 0.1, y: 1 },
      { x: 0.2, y: 0 },
      { x: 0.3, y: 0 },
    ]);
    expect(n).toBe(3);
    expect(puntos).toHaveLength(1);
    expect(puntos[0].x).toBeCloseTo(0.2);
    expect(puntos[0].y).toBeCloseTo(1 / 3);
  });

  test('los x repetidos se promedian antes de ajustar', () => {
    const { puntos, n } = ajustarIsotonica([
      { x: 0.5, y: 0 },
      { x: 0.5, y: 1 },
      { x: 0.5, y: 1 },
    ]);
    expect(n).toBe(3);
    expect(puntos).toEqual([{ x: 0.5, y: 2 / 3 }]);
  });
});

describe('aplicarIsotonica', () => {
  const diagonal: ModeloIsotonico = { puntos: [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 }], n: 10 };

  test('interpola linealmente entre puntos', () => {
    expect(aplicarIsotonica(diagonal, 0.5)).toBeCloseTo(0.5);
  });

  test('fuera del rango es constante', () => {
    expect(aplicarIsotonica(diagonal, 0.1)).toBeCloseTo(0.2);
    expect(aplicarIsotonica(diagonal, 0.9)).toBeCloseTo(0.8);
  });

  test('recorta a los límites configurados: nunca 0 ni 1', () => {
    const { popMinima, popMaxima } = config.verificacion;
    expect(aplicarIsotonica({ puntos: [{ x: 0.5, y: 0 }], n: 5 }, 0.5)).toBe(popMinima);
    expect(aplicarIsotonica({ puntos: [{ x: 0.5, y: 1 }], n: 5 }, 0.5)).toBe(popMaxima);
  });

  test('un modelo sin puntos es la identidad', () => {
    expect(aplicarIsotonica({ puntos: [], n: 0 }, 0.37)).toBe(0.37);
  });
});

describe('construirCalibracion', () => {
  test('un horizonte sin los pares mínimos queda sin modelo', () => {
    const minimos = config.verificacion.paresMinimosCalibracion;
    const pares = Array.from({ length: minimos - 1 }, () => par(1, 0.8, 0));
    expect(construirCalibracion(pares)).toEqual({});
  });

  test('al juntar los pares mínimos el horizonte se calibra', () => {
    const minimos = config.verificacion.paresMinimosCalibracion;
    const pares = Array.from({ length: minimos }, (_, i) => par(1, 0.8, i < 15 ? 1 : 0));
    const calibracion = construirCalibracion(pares);
    expect(calibracion[1].n).toBe(minimos);
    expect(aplicarIsotonica(calibracion[1], 0.8)).toBeCloseTo(15 / minimos);
  });

  test('un horizonte calibrado no afecta a otro', () => {
    const minimos = config.verificacion.paresMinimosCalibracion;
    const pares = [
      ...Array.from({ length: minimos }, () => par(1, 0.8, 0)),
      ...Array.from({ length: 5 }, () => par(3, 0.8, 1)),
    ];
    const calibracion = construirCalibracion(pares);
    expect(calibracion[1]).toBeDefined();
    expect(calibracion[3]).toBeUndefined();
  });
});

describe('calibrarPop y calibrarSerie', () => {
  // Sesgo claro en la banda 0–1 h: se dijo 80 % y llovió el 10 % de las veces.
  const calibracion: Calibracion = { 1: { puntos: [{ x: 0.8, y: 0.1 }], n: 200 } };

  test('corrige la PoP cuando el horizonte tiene modelo', () => {
    const finMs = AHORA + MS_HORA / 2; // faltan 30 min: banda 0–1 h
    expect(calibrarPop(calibracion, 0.8, finMs, AHORA)).toBeCloseTo(0.1);
  });

  test('sin modelo es la identidad', () => {
    const finMs = AHORA + MS_HORA / 2;
    expect(calibrarPop({}, 0.8, finMs, AHORA)).toBe(0.8);
  });

  test('fuera de horizonte (pasada o más de 72 h) es la identidad', () => {
    expect(calibrarPop(calibracion, 0.8, AHORA - MS_HORA, AHORA)).toBe(0.8);
    expect(calibrarPop(calibracion, 0.8, AHORA + 100 * MS_HORA, AHORA)).toBe(0.8);
  });

  test('otro horizonte sin modelo es la identidad aunque la 0–1 h esté calibrada', () => {
    const finMs = AHORA + 2 * MS_HORA; // banda 1–3 h
    expect(calibrarPop(calibracion, 0.8, finMs, AHORA)).toBe(0.8);
  });

  test('calibrarSerie aplica hora por hora', () => {
    const horasUtc = [
      new Date(AHORA + MS_HORA / 2).toISOString(),
      new Date(AHORA + 2 * MS_HORA).toISOString(),
    ];
    expect(calibrarSerie(calibracion, horasUtc, [0.8, 0.8], AHORA)).toEqual([
      expect.closeTo(0.1),
      0.8,
    ]);
  });
});
