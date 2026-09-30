import { describe, expect, test } from 'vitest';
import { indiceHoraEnCurso } from '../../src/utils/horas';

const HORAS = ['2026-09-30T02:00:00Z', '2026-09-30T03:00:00Z', '2026-09-30T04:00:00Z', '2026-09-30T05:00:00Z'];

describe('indiceHoraEnCurso', () => {
  test('a las 03:36 la hora en curso lleva la etiqueta de las 04:00', () => {
    expect(indiceHoraEnCurso(HORAS, Date.parse('2026-09-30T03:36:00Z'))).toBe(2);
  });

  test('justo en punto ya pertenece a la hora siguiente', () => {
    expect(indiceHoraEnCurso(HORAS, Date.parse('2026-09-30T03:00:00Z'))).toBe(2);
  });

  test('un minuto antes de la hora sigue en la etiqueta que cierra en ella', () => {
    expect(indiceHoraEnCurso(HORAS, Date.parse('2026-09-30T03:59:00Z'))).toBe(2);
  });

  test('antes de la serie da la primera hora', () => {
    expect(indiceHoraEnCurso(HORAS, Date.parse('2026-09-29T20:00:00Z'))).toBe(0);
  });

  test('después de la serie no hay hora en curso y se devuelve 0', () => {
    expect(indiceHoraEnCurso(HORAS, Date.parse('2026-10-01T00:00:00Z'))).toBe(0);
  });
});
