import { describe, expect, test } from 'vitest';
import type { ResumenExactitud } from '../../src/services/verificacion';
import { progresoAprendizaje } from '../../src/utils/aprendizaje';

function resumen(n: number, horizonteH = 3): ResumenExactitud {
  return {
    observaciones: 0,
    horasVerificadas: 0,
    horasInsuficientes: 0,
    pares: 0,
    global: null,
    skill: null,
    conRadar: null,
    porHorizonte: [{ horizonteH, n, frecuencia: 0, brier: 0, brierEnsamble: 0, faltan: 0 }],
    confiabilidad: [],
  };
}

describe('progresoAprendizaje', () => {
  test('sin almacenamiento tiene precedencia sobre resumen y horizonte ausentes', () => {
    expect(progresoAprendizaje(null, false, null)).toEqual({
      estado: 'sin-almacenamiento', n: 0, meta: 150, faltan: 150, fraccion: 0,
    });
    expect(progresoAprendizaje(resumen(200), false, 3)).toMatchObject({
      estado: 'sin-almacenamiento', n: 0, faltan: 150, fraccion: 0,
    });
  });

  test('resumen ausente indica cargando aun sin horizonte', () => {
    expect(progresoAprendizaje(null, true, null)).toEqual({
      estado: 'cargando', n: 0, meta: 150, faltan: 150, fraccion: 0,
    });
    expect(progresoAprendizaje(null, true, 3).estado).toBe('cargando');
  });

  test('horizonte ausente indica sin datos aunque el resumen esté calibrado', () => {
    expect(progresoAprendizaje(resumen(200), true, null)).toEqual({
      estado: 'sin-datos', n: 0, meta: 150, faltan: 150, fraccion: 0,
    });
  });

  test('cero pares con resumen presente indica sin datos', () => {
    expect(progresoAprendizaje(resumen(0), true, 3)).toEqual({
      estado: 'sin-datos', n: 0, meta: 150, faltan: 150, fraccion: 0,
    });
  });

  test('un horizonte sin fila tiene cero pares y no toma los de otro horizonte', () => {
    expect(progresoAprendizaje(resumen(150), true, 6)).toEqual({
      estado: 'sin-datos', n: 0, meta: 150, faltan: 150, fraccion: 0,
    });
    expect(progresoAprendizaje({ ...resumen(0), porHorizonte: [] }, true, 3).n).toBe(0);
  });

  test('149 pares siguen aprendiendo con uno pendiente', () => {
    expect(progresoAprendizaje(resumen(149), true, 3)).toEqual({
      estado: 'aprendiendo', n: 149, meta: 150, faltan: 1, fraccion: 149 / 150,
    });
  });

  test('150 pares exactos alcanzan la calibración', () => {
    expect(progresoAprendizaje(resumen(150), true, 3)).toEqual({
      estado: 'calibrado', n: 150, meta: 150, faltan: 0, fraccion: 1,
    });
  });

  test('más pares que la meta conservan n y acotan la fracción a uno', () => {
    expect(progresoAprendizaje(resumen(200), true, 3)).toEqual({
      estado: 'calibrado', n: 200, meta: 150, faltan: 0, fraccion: 1,
    });
  });

  test('una meta personalizada rige el avance y todos los estados', () => {
    expect(progresoAprendizaje(resumen(10), true, 3, 20)).toEqual({
      estado: 'aprendiendo', n: 10, meta: 20, faltan: 10, fraccion: 0.5,
    });
    expect(progresoAprendizaje(resumen(20), true, 3, 20)).toEqual({
      estado: 'calibrado', n: 20, meta: 20, faltan: 0, fraccion: 1,
    });
    expect(progresoAprendizaje(null, false, null, 20)).toEqual({
      estado: 'sin-almacenamiento', n: 0, meta: 20, faltan: 20, fraccion: 0,
    });
  });

  test('toma exclusivamente la fila del horizonte seleccionado sin mutar el resumen', () => {
    const e = resumen(150);
    e.porHorizonte.push(...resumen(15, 6).porHorizonte);
    const copia = structuredClone(e);
    expect(progresoAprendizaje(e, true, 6)).toEqual({
      estado: 'aprendiendo', n: 15, meta: 150, faltan: 135, fraccion: 0.1,
    });
    expect(e).toEqual(copia);
  });
});
