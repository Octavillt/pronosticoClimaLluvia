import { describe, expect, test } from 'vitest';
import { config } from '../../src/config';
import type { Nowcast, Observacion, Prediccion } from '../../src/domain/types';
import {
  calibracionDesde,
  observacionDeUsuario,
  observacionesDeRadar,
} from '../../src/services/registroVerificacion';
import { MS_HORA } from '../../src/utils/horas';

const CELDA = '9g3qh';
const AHORA = Date.parse('2026-09-30T18:30:00Z');
const H18 = Date.parse('2026-09-30T18:00:00Z');

function nowcastConPuntual(puntual: { tMs: number; dbz: number }[]): Nowcast {
  return {
    tFrameMs: AHORA,
    movimiento: { estado: 'sin-ecos' },
    observados: [],
    pronostico: [],
    avance: null,
    puntual,
  };
}

describe('observacionesDeRadar', () => {
  test('una observación por frame puntual, lluvia según el umbral de dBZ', () => {
    const umbral = config.radar.umbralDbz;
    const nowcast = nowcastConPuntual([
      { tMs: H18 - 20 * 60_000, dbz: umbral + 5 },
      { tMs: H18 - 10 * 60_000, dbz: umbral - 1 },
      { tMs: H18, dbz: umbral },
    ]);
    expect(observacionesDeRadar(nowcast, CELDA)).toEqual([
      { id: `${CELDA}|radar|${H18 - 20 * 60_000}`, celda: CELDA, tMs: H18 - 20 * 60_000, lluvia: true, fuente: 'radar' },
      { id: `${CELDA}|radar|${H18 - 10 * 60_000}`, celda: CELDA, tMs: H18 - 10 * 60_000, lluvia: false, fuente: 'radar' },
      { id: `${CELDA}|radar|${H18}`, celda: CELDA, tMs: H18, lluvia: true, fuente: 'radar' },
    ]);
  });

  test('sin frames puntuales no hay observaciones', () => {
    expect(observacionesDeRadar(nowcastConPuntual([]), CELDA)).toEqual([]);
  });
});

describe('observacionDeUsuario', () => {
  test('el id distingue la fuente para no mezclarse con el radar', () => {
    expect(observacionDeUsuario(CELDA, true, H18)).toEqual({
      id: `${CELDA}|usuario|${H18}`,
      celda: CELDA,
      tMs: H18,
      lluvia: true,
      fuente: 'usuario',
    });
  });
});

describe('calibracionDesde', () => {
  function historialSesgado(pares: number, horizonteH = 1): { predicciones: Prediccion[]; observaciones: Observacion[] } {
    const predicciones: Prediccion[] = [];
    const observaciones: Observacion[] = [];
    for (let i = 1; i <= pares; i += 1) {
      const finMs = H18 - i * MS_HORA;
      predicciones.push({
        id: `${CELDA}|${finMs}|${horizonteH}`,
        celda: CELDA,
        finMs,
        emitidoMs: finMs - MS_HORA / 2,
        horizonteH,
        pop: 0.8,
        popEnsamble: 0.8,
        pesoRadar: 0,
      });
      for (let v = 0; v < 3; v += 1) {
        const tMs = finMs - (v + 1) * 10 * 60_000;
        observaciones.push({ id: `${CELDA}|radar|${tMs}`, celda: CELDA, tMs, lluvia: false, fuente: 'radar' });
      }
    }
    return { predicciones, observaciones };
  }

  test('con suficientes pares verificados ajusta el modelo del horizonte', () => {
    const { predicciones, observaciones } = historialSesgado(config.verificacion.paresMinimosCalibracion);
    const { calibracion, pares } = calibracionDesde(predicciones, observaciones, AHORA);
    expect(pares).toHaveLength(config.verificacion.paresMinimosCalibracion);
    expect(calibracion[1]).toBeDefined();
    // Se dijo 80 % y nunca llovió: la corrección baja al piso configurado.
    expect(calibracion[1].puntos[0].y).toBe(0);
  });

  test('con pocos pares no hay modelo y la lista de pares refleja lo verificado', () => {
    const { predicciones, observaciones } = historialSesgado(5);
    const { calibracion, pares } = calibracionDesde(predicciones, observaciones, AHORA);
    expect(pares).toHaveLength(5);
    expect(calibracion).toEqual({});
  });
});
