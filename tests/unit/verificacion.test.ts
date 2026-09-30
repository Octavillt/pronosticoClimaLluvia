import { describe, expect, test } from 'vitest';
import { config } from '../../src/config';
import type { Observacion, ParVerificado, Prediccion } from '../../src/domain/types';
import {
  brier,
  crearPredicciones,
  emparejar,
  etiquetaHorizonte,
  horizonteDe,
  resolverHoras,
  resumirExactitud,
  tablaConfiabilidad,
} from '../../src/services/verificacion';
import { MS_HORA } from '../../src/utils/horas';

const CELDA = '9g3qh';
// 18:30 UTC: la hora (17:00, 18:00] ya terminó; la (18:00, 19:00] está en curso.
const AHORA = Date.parse('2026-09-30T18:30:00Z');
const H18 = Date.parse('2026-09-30T18:00:00Z');

const iso = (ms: number) => new Date(ms).toISOString();

function prediccion(finMs: number, extra: Partial<Prediccion> = {}): Prediccion {
  const horizonteH = extra.horizonteH ?? 1;
  return {
    id: `${CELDA}|${finMs}|${horizonteH}`,
    celda: CELDA,
    finMs,
    emitidoMs: finMs - MS_HORA / 2,
    horizonteH,
    pop: 0.5,
    popEnsamble: 0.4,
    pesoRadar: 0,
    ...extra,
  };
}

/** Observaciones secas en `n` ventanas de 10 min de la hora que cierra en `finMs`. */
function ventanasDe(finMs: number, n: number, lluviaEn: number[] = [], celda = CELDA): Observacion[] {
  return Array.from({ length: n }, (_, v) => {
    const tMs = finMs - (v + 1) * 10 * 60_000;
    return { id: `${celda}|radar|${tMs}`, celda, tMs, lluvia: lluviaEn.includes(v), fuente: 'radar' };
  });
}

describe('horizonteDe', () => {
  test.each([
    [0.5, 1],
    [1, 1],
    [1.5, 3],
    [3, 3],
    [4, 6],
    [6, 6],
    [7, 12],
    [12, 12],
    [13, 24],
    [24, 24],
    [25, 72],
    [72, 72],
  ])('%i h cae en la banda %i', (horas, esperado) => {
    expect(horizonteDe(horas)).toBe(esperado);
  });

  test.each([0, -1, 72.1, 100, NaN])('%i no tiene banda (null)', (horas) => {
    expect(horizonteDe(horas)).toBeNull();
  });
});

describe('etiquetaHorizonte', () => {
  test('usa la cota anterior como inicio de la banda', () => {
    expect(etiquetaHorizonte(1)).toBe('0–1 h');
    expect(etiquetaHorizonte(3)).toBe('1–3 h');
    expect(etiquetaHorizonte(72)).toBe('24–72 h');
  });
});

describe('crearPredicciones', () => {
  test('id, horizonte y alineación con finMs', () => {
    const horasUtc = [iso(AHORA + MS_HORA / 2), iso(AHORA + 5 * MS_HORA)];
    const lista = crearPredicciones({
      celda: CELDA,
      emitidoMs: AHORA,
      horasUtc,
      pop: [0.3, 0.6],
      popEnsamble: [0.2, 0.5],
      pesoRadar: [0.1, 0],
    });
    expect(lista).toHaveLength(2);
    const fin0 = AHORA + MS_HORA / 2;
    expect(lista[0]).toEqual({
      id: `${CELDA}|${fin0}|1`,
      celda: CELDA,
      finMs: fin0,
      emitidoMs: AHORA,
      horizonteH: 1,
      pop: 0.3,
      popEnsamble: 0.2,
      pesoRadar: 0.1,
    });
    expect(lista[1].horizonteH).toBe(6);
  });

  test('las horas ya terminadas y las de más de 72 h no se guardan', () => {
    const horasUtc = [iso(AHORA - MS_HORA), iso(AHORA), iso(AHORA + MS_HORA), iso(AHORA + 100 * MS_HORA)];
    const lista = crearPredicciones({
      celda: CELDA,
      emitidoMs: AHORA,
      horasUtc,
      pop: [0.1, 0.1, 0.1, 0.1],
      popEnsamble: [0.1, 0.1, 0.1, 0.1],
      pesoRadar: [0, 0, 0, 0],
    });
    expect(lista.map((p) => p.finMs)).toEqual([AHORA + MS_HORA]);
  });

  test('una hora sin pop alineada se omite', () => {
    const lista = crearPredicciones({
      celda: CELDA,
      emitidoMs: AHORA,
      horasUtc: [iso(AHORA + MS_HORA)],
      pop: [],
      popEnsamble: [],
      pesoRadar: [],
    });
    expect(lista).toEqual([]);
  });
});

describe('resolverHoras', () => {
  test('una hora con 2 ventanas observadas queda insuficiente', () => {
    const { resueltas, insuficientes } = resolverHoras(ventanasDe(H18, 2), AHORA);
    expect(resueltas.size).toBe(0);
    expect(insuficientes).toBe(1);
  });

  test('con 3 ventanas secas la hora se resuelve sin lluvia', () => {
    const { resueltas } = resolverHoras(ventanasDe(H18, 3), AHORA);
    expect(resueltas.get(`${CELDA}|${H18}`)).toBe(false);
  });

  test('una ventana con lluvia y dos secas resuelven la hora con lluvia', () => {
    const { resueltas } = resolverHoras(ventanasDe(H18, 3, [1]), AHORA);
    expect(resueltas.get(`${CELDA}|${H18}`)).toBe(true);
  });

  test('dos observaciones en la misma ventana de 10 min cuentan una vez', () => {
    // 18:00 − 4 min y − 5 min caen en la misma ventana; con solo otra ventana no basta.
    const observaciones: Observacion[] = [
      { id: 'a', celda: CELDA, tMs: H18 - 4 * 60_000, lluvia: true, fuente: 'usuario' },
      { id: 'b', celda: CELDA, tMs: H18 - 5 * 60_000, lluvia: false, fuente: 'radar' },
      { id: 'c', celda: CELDA, tMs: H18 - 20 * 60_000, lluvia: false, fuente: 'radar' },
    ];
    const { resueltas, insuficientes } = resolverHoras(observaciones, AHORA);
    expect(resueltas.size).toBe(0);
    expect(insuficientes).toBe(1);
  });

  test('las horas que aún no terminan se ignoran', () => {
    const futura = H18 + MS_HORA; // (18:00, 19:00], en curso a las 18:30
    const { resueltas, insuficientes } = resolverHoras(ventanasDe(futura, 3), AHORA);
    expect(resueltas.size).toBe(0);
    expect(insuficientes).toBe(0);
  });

  test('la misma hora en otra celda es otra hora', () => {
    const observaciones = [...ventanasDe(H18, 3), ...ventanasDe(H18, 2, [], 'otra1')];
    const { resueltas, insuficientes } = resolverHoras(observaciones, AHORA);
    expect(resueltas.get(`${CELDA}|${H18}`)).toBe(false);
    expect(insuficientes).toBe(1);
  });
});

describe('emparejar', () => {
  test('junta cada predicción con su hora resuelta y omite las demás', () => {
    const predicciones = [
      prediccion(H18, { pop: 0.8, popEnsamble: 0.6, pesoRadar: 0.5 }),
      prediccion(H18 - MS_HORA),
      prediccion(H18 + MS_HORA),
    ];
    const resueltas = new Map([
      [`${CELDA}|${H18}`, true],
      [`${CELDA}|${H18 - MS_HORA}`, false],
    ]);
    const pares = emparejar(predicciones, resueltas);
    expect(pares).toEqual([
      { horizonteH: 1, pop: 0.8, popEnsamble: 0.6, pesoRadar: 0.5, observado: 1 },
      { horizonteH: 1, pop: 0.5, popEnsamble: 0.4, pesoRadar: 0, observado: 0 },
    ]);
  });
});

describe('brier', () => {
  test('sin datos devuelve null', () => {
    expect(brier([])).toBeNull();
  });

  test('pronósticos perfectos dan 0', () => {
    expect(brier([{ p: 0, o: 0 }, { p: 1, o: 1 }])).toBe(0);
  });

  test('promedia el error cuadrático', () => {
    expect(brier([{ p: 0.5, o: 1 }])).toBe(0.25);
  });
});

describe('tablaConfiabilidad', () => {
  test('agrupa por cajas de PoP y omite las vacías', () => {
    const pares: ParVerificado[] = [
      { horizonteH: 1, pop: 0.05, popEnsamble: 0, pesoRadar: 0, observado: 0 },
      { horizonteH: 1, pop: 0.15, popEnsamble: 0, pesoRadar: 0, observado: 1 },
      { horizonteH: 1, pop: 0.95, popEnsamble: 0, pesoRadar: 0, observado: 1 },
    ];
    const tabla = tablaConfiabilidad(pares);
    expect(tabla).toHaveLength(3);
    expect(tabla[0]).toEqual({ desde: 0, hasta: 0.1, n: 1, popMedia: 0.05, frecuencia: 0 });
    expect(tabla[1]).toEqual({ desde: 0.1, hasta: 0.2, n: 1, popMedia: 0.15, frecuencia: 1 });
  });

  test('pop = 1 cae en la última caja', () => {
    const pares: ParVerificado[] = [
      { horizonteH: 1, pop: 1, popEnsamble: 0, pesoRadar: 0, observado: 1 },
      { horizonteH: 1, pop: 0.95, popEnsamble: 0, pesoRadar: 0, observado: 0 },
    ];
    const tabla = tablaConfiabilidad(pares);
    expect(tabla).toHaveLength(1);
    expect(tabla[0].desde).toBe(0.9);
    expect(tabla[0].n).toBe(2);
    expect(tabla[0].popMedia).toBeCloseTo(0.975);
    expect(tabla[0].frecuencia).toBe(0.5);
  });
});

describe('resumirExactitud', () => {
  test('resume pares, skill, aporte del radar y cuánto falta para calibrar', () => {
    const predicciones = [
      prediccion(H18, { pop: 0.8, popEnsamble: 0.6, pesoRadar: 0.5 }),
      prediccion(H18 - MS_HORA, { pop: 0.3, popEnsamble: 0.4, pesoRadar: 0 }),
    ];
    const observaciones = [
      ...ventanasDe(H18, 3, [0]), // llovió
      ...ventanasDe(H18 - MS_HORA, 3), // no llovió
    ];
    const resumen = resumirExactitud(predicciones, observaciones, AHORA);

    expect(resumen.observaciones).toBe(6);
    expect(resumen.horasVerificadas).toBe(2);
    expect(resumen.horasInsuficientes).toBe(0);
    expect(resumen.pares).toBe(2);

    // Pares: (0.8, llovió) y (0.3, no llovió). Frecuencia 0.5, Brier = (0.04 + 0.09) / 2.
    expect(resumen.global).not.toBeNull();
    expect(resumen.global!.frecuencia).toBe(0.5);
    expect(resumen.global!.brier).toBeCloseTo(0.065);
    expect(resumen.global!.brierEnsamble).toBeCloseTo((0.16 + 0.16) / 2);
    expect(resumen.global!.brierClimatologia).toBe(0.25);
    expect(resumen.skill).toBeCloseTo(1 - 0.065 / 0.25);

    // Solo el primer par pesó el radar (0.5 > 0.05).
    expect(resumen.conRadar).not.toBeNull();
    expect(resumen.conRadar!.n).toBe(1);
    expect(resumen.conRadar!.brier).toBeCloseTo(0.04);
    expect(resumen.conRadar!.brierEnsamble).toBeCloseTo(0.16);

    expect(resumen.porHorizonte).toHaveLength(1);
    expect(resumen.porHorizonte[0].horizonteH).toBe(1);
    expect(resumen.porHorizonte[0].n).toBe(2);
    expect(resumen.porHorizonte[0].faltan).toBe(config.verificacion.paresMinimosCalibracion - 2);
    expect(resumen.confiabilidad.length).toBeGreaterThan(0);
  });

  test('sin pares no hay global, skill ni aporte del radar', () => {
    const resumen = resumirExactitud([], [], AHORA);
    expect(resumen.global).toBeNull();
    expect(resumen.skill).toBeNull();
    expect(resumen.conRadar).toBeNull();
    expect(resumen.porHorizonte).toEqual([]);
    expect(resumen.confiabilidad).toEqual([]);
  });

  test('faltan es 0 cuando el horizonte ya junta los pares mínimos', () => {
    const n = config.verificacion.paresMinimosCalibracion;
    const predicciones: Prediccion[] = [];
    const observaciones: Observacion[] = [];
    for (let i = 1; i <= n; i += 1) {
      const finMs = H18 - i * MS_HORA;
      predicciones.push(prediccion(finMs));
      observaciones.push(...ventanasDe(finMs, 3));
    }
    const resumen = resumirExactitud(predicciones, observaciones, AHORA);
    expect(resumen.porHorizonte[0].n).toBe(n);
    expect(resumen.porHorizonte[0].faltan).toBe(0);
  });
});
