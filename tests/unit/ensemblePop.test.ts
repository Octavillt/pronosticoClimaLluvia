import { describe, expect, test } from 'vitest';
import { computePopSeries, memberPop } from '../../src/services/ensemblePop';

describe('memberPop', () => {
  test('aplica suavizado de Laplace con 0 miembros lluviosos', () => {
    const miembros = [[0, 0], [0, 0], [0, 0], [0, 0]];
    expect(memberPop(miembros, 0)).toBeCloseTo(0.5 / 5);
  });

  test('aplica suavizado de Laplace con todos los miembros lluviosos', () => {
    const miembros = [[1, 1], [1, 1], [1, 1], [1, 1]];
    expect(memberPop(miembros, 0)).toBeCloseTo(4.5 / 5);
  });

  test('cuenta miembros por encima del umbral de 0.2 mm', () => {
    const miembros = [[0.1], [0.2], [0.5], [0]];
    expect(memberPop(miembros, 0)).toBeCloseTo(2.5 / 5);
  });

  test('ignora horas sin dato en un miembro', () => {
    const miembros = [[1], []];
    expect(memberPop(miembros, 0)).toBeCloseTo(1.5 / 3);
  });

  test('con arreglo vacío devuelve 0', () => {
    expect(memberPop([], 0)).toBe(0);
  });
});

describe('computePopSeries', () => {
  test('pondera por número de miembros de cada modelo', () => {
    const grande = { modelo: 'a', miembros: [[1], [1], [1]] };
    const chico = { modelo: 'b', miembros: [[0]] };
    const [pop] = computePopSeries([grande, chico], 1);
    const popGrande = 3.5 / 4;
    const popChico = 0.5 / 2;
    expect(pop).toBeCloseTo((popGrande * 3 + popChico * 1) / 4);
  });

  test('alinea cada hora con su propio índice', () => {
    const modelo = { modelo: 'a', miembros: [[0, 5], [0, 5]] };
    const pop = computePopSeries([modelo], 2);
    expect(pop[0]).toBeCloseTo(0.5 / 3);
    expect(pop[1]).toBeCloseTo(2.5 / 3);
  });

  test('sin miembros devuelve arreglo vacío', () => {
    expect(computePopSeries([{ modelo: 'a', miembros: [] }], 3)).toEqual([]);
  });
});
