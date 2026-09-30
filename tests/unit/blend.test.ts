import { describe, expect, test } from 'vitest';
import type { Movimiento, Nowcast, PasoNowcast } from '../../src/domain/types';
import { mezclarPop, pesoPorHorizonte } from '../../src/services/blend';

const MIN = 60_000;
/** 21:36 hora de CDMX. */
const AHORA = Date.parse('2026-09-30T03:36:00Z');
/** El último frame de radar es de hace 10 min. */
const T_FRAME = AHORA - 10 * MIN;

/** Etiquetas de las 03:00 a las 08:00 UTC: la de las 03:00 ya terminó y la de las 04:00 está en curso. */
const HORAS = [3, 4, 5, 6, 7, 8].map((h) => `2026-09-30T0${h}:00:00Z`);

function nowcastFalso(
  popEnMinutos: (minutosDesdeFrame: number) => number,
  opciones: { cobertura?: number; movimiento?: Movimiento; observados?: PasoNowcast[] } = {},
): Nowcast {
  const cobertura = opciones.cobertura ?? 1;
  return {
    tFrameMs: T_FRAME,
    movimiento: opciones.movimiento ?? { estado: 'estimado', vxPxMin: 0.5, vyPxMin: 0, calidad: 0.9 },
    observados: opciones.observados ?? [],
    pronostico: Array.from({ length: 19 }, (_, i) => ({
      tMs: T_FRAME + i * 10 * MIN,
      pop: popEnMinutos(i * 10),
      cobertura,
    })),
    avance: null,
    puntual: [],
  };
}

const ensamble = (v: number) => HORAS.map(() => v);

describe('pesoPorHorizonte', () => {
  test('baja linealmente de 0.9 a 0 entre 0 y 180 min', () => {
    expect(pesoPorHorizonte(0)).toBeCloseTo(0.9, 10);
    expect(pesoPorHorizonte(90)).toBeCloseTo(0.45, 10);
    expect(pesoPorHorizonte(180)).toBe(0);
  });

  test('no pasa de los extremos', () => {
    expect(pesoPorHorizonte(-30)).toBeCloseTo(0.9, 10);
    expect(pesoPorHorizonte(400)).toBe(0);
  });

  test('los pesos son configurables', () => {
    expect(pesoPorHorizonte(30, 0.5, 60)).toBeCloseTo(0.25, 10);
  });
});

describe('mezclarPop', () => {
  test('sin nowcast devuelve el ensamble sin tocarlo', () => {
    const r = mezclarPop({ horasUtc: HORAS, popEnsamble: ensamble(0.3), nowcast: null, ahoraMs: AHORA });
    expect(r.pop).toEqual(ensamble(0.3));
    expect(r.popRadar.every((p) => p === null)).toBe(true);
    expect(r.pesoRadar.every((p) => p === 0)).toBe(true);
  });

  test('la hora en curso mezcla con el peso del tramo que aún no ocurre', () => {
    const r = mezclarPop({ horasUtc: HORAS, popEnsamble: ensamble(0.2), nowcast: nowcastFalso(() => 0.8), ahoraMs: AHORA });
    // Etiqueta 04:00 = (03:00, 04:00]. Tramo futuro: 03:36–04:00, punto medio 03:48,
    // que está a 22 min del frame de las 03:26.
    const peso = 0.9 * (1 - 22 / 180);
    expect(r.pesoRadar[1]).toBeCloseTo(peso, 10);
    expect(r.popRadar[1]).toBeCloseTo(0.8, 10);
    expect(r.pop[1]).toBeCloseTo(peso * 0.8 + (1 - peso) * 0.2, 10);
  });

  test('las horas que ya terminaron conservan el ensamble', () => {
    const r = mezclarPop({ horasUtc: HORAS, popEnsamble: ensamble(0.2), nowcast: nowcastFalso(() => 0.8), ahoraMs: AHORA });
    expect(r.pop[0]).toBe(0.2);
    expect(r.popRadar[0]).toBeNull();
    expect(r.pesoRadar[0]).toBe(0);
  });

  test('el peso del radar baja con las horas y se anula pasado el horizonte', () => {
    const r = mezclarPop({ horasUtc: HORAS, popEnsamble: ensamble(0.2), nowcast: nowcastFalso(() => 0.8), ahoraMs: AHORA });
    expect(r.pesoRadar[1]).toBeGreaterThan(r.pesoRadar[2]);
    expect(r.pesoRadar[2]).toBeGreaterThan(r.pesoRadar[3]);
    expect(r.pesoRadar[3]).toBeGreaterThan(0);
    // 07:00 abarca (06:00, 07:00]; su punto medio queda a 184 min del frame, más allá de 180.
    expect(r.pesoRadar[4]).toBe(0);
    expect(r.pop[4]).toBe(0.2);
    expect(r.pesoRadar[5]).toBe(0);
    expect(r.popRadar[5]).toBeNull();
  });

  test('en cada hora toma el máximo de los pasos del radar (llueve en algún momento)', () => {
    // Pico de 0.9 a los 20 min del frame (03:46), dentro de la hora en curso.
    const nowcast = nowcastFalso((min) => (min === 20 ? 0.9 : 0.1));
    const r = mezclarPop({ horasUtc: HORAS, popEnsamble: ensamble(0), nowcast, ahoraMs: AHORA });
    expect(r.popRadar[1]).toBeCloseTo(0.9, 10);
    expect(r.popRadar[2]).toBeCloseTo(0.1, 10);
  });

  test('los frames ya observados en la hora en curso también cuentan', () => {
    const observados: PasoNowcast[] = [{ tMs: T_FRAME - 10 * MIN, pop: 0.95, cobertura: 1 }];
    const r = mezclarPop({
      horasUtc: HORAS,
      popEnsamble: ensamble(0.1),
      nowcast: nowcastFalso(() => 0.05, { observados }),
      ahoraMs: AHORA,
    });
    // 03:16 cae dentro de (03:00, 04:00]: ya llovió en esta hora.
    expect(r.popRadar[1]).toBeCloseTo(0.95, 10);
    expect(r.pop[1]).toBeGreaterThan(0.7);
  });

  test('la cobertura parcial reduce el peso del radar en la misma proporción', () => {
    const completa = mezclarPop({ horasUtc: HORAS, popEnsamble: ensamble(0.2), nowcast: nowcastFalso(() => 0.8), ahoraMs: AHORA });
    const parcial = mezclarPop({ horasUtc: HORAS, popEnsamble: ensamble(0.2), nowcast: nowcastFalso(() => 0.8, { cobertura: 0.6 }), ahoraMs: AHORA });
    expect(parcial.pesoRadar[1]).toBeCloseTo(completa.pesoRadar[1] * 0.6, 10);
  });

  test('con cobertura por debajo del mínimo el radar no aporta', () => {
    const r = mezclarPop({ horasUtc: HORAS, popEnsamble: ensamble(0.2), nowcast: nowcastFalso(() => 0.99, { cobertura: 0.4 }), ahoraMs: AHORA });
    expect(r.pop).toEqual(ensamble(0.2));
    expect(r.popRadar.every((p) => p === null)).toBe(true);
    expect(r.pesoRadar.every((p) => p === 0)).toBe(true);
  });

  test('un movimiento incierto reduce el peso a la mitad', () => {
    const seguro = mezclarPop({ horasUtc: HORAS, popEnsamble: ensamble(0.2), nowcast: nowcastFalso(() => 0.8), ahoraMs: AHORA });
    const incierto = mezclarPop({ horasUtc: HORAS, popEnsamble: ensamble(0.2), nowcast: nowcastFalso(() => 0.8, { movimiento: { estado: 'incierto' } }), ahoraMs: AHORA });
    expect(incierto.pesoRadar[1]).toBeCloseTo(seguro.pesoRadar[1] * 0.5, 10);
  });

  test('"sin-ecos" no penaliza el peso: un cielo despejado en el radar es información', () => {
    const conMovimiento = mezclarPop({ horasUtc: HORAS, popEnsamble: ensamble(0.6), nowcast: nowcastFalso(() => 0.02), ahoraMs: AHORA });
    const sinEcos = mezclarPop({ horasUtc: HORAS, popEnsamble: ensamble(0.6), nowcast: nowcastFalso(() => 0.02, { movimiento: { estado: 'sin-ecos' } }), ahoraMs: AHORA });
    expect(sinEcos.pesoRadar).toEqual(conMovimiento.pesoRadar);
    // El radar despejado baja bastante la PoP del ensamble en la hora en curso.
    expect(sinEcos.pop[1]).toBeLessThan(0.25);
  });

  test('el resultado siempre queda entre 0 y 1', () => {
    const r = mezclarPop({ horasUtc: HORAS, popEnsamble: ensamble(1), nowcast: nowcastFalso(() => 1), ahoraMs: AHORA });
    expect(r.pop.every((p) => p >= 0 && p <= 1)).toBe(true);
  });

  test('conserva la longitud de la serie', () => {
    const r = mezclarPop({ horasUtc: HORAS, popEnsamble: ensamble(0.2), nowcast: nowcastFalso(() => 0.5), ahoraMs: AHORA });
    expect(r.pop).toHaveLength(HORAS.length);
    expect(r.popRadar).toHaveLength(HORAS.length);
    expect(r.pesoRadar).toHaveLength(HORAS.length);
  });
});
