import { describe, expect, test } from 'vitest';
import {
  horasUtcDesdeEpoch,
  PARAMETROS_TIEMPO,
  zonaDeRespuesta,
} from '../../src/providers/tiempoOpenMeteo';

describe('PARAMETROS_TIEMPO', () => {
  test('pide zona automática y horas epoch a la API', () => {
    expect(PARAMETROS_TIEMPO).toEqual({ timezone: 'auto', timeformat: 'unixtime' });
  });
});

describe('horasUtcDesdeEpoch', () => {
  test('convierte segundos epoch a cadenas UTC con Z', () => {
    expect(horasUtcDesdeEpoch([1790748000])).toEqual(['2026-09-30T06:00Z']);
  });

  test('convierte dos horas consecutivas con paso de 3600', () => {
    expect(horasUtcDesdeEpoch([1790748000, 1790751600])).toEqual([
      '2026-09-30T06:00Z',
      '2026-09-30T07:00Z',
    ]);
  });

  test('lanza con cadenas ISO en lugar de epoch', () => {
    expect(() => horasUtcDesdeEpoch(['2026-09-24T00:00'] as unknown)).toThrow('epoch');
  });

  test('lanza con NaN e Infinity', () => {
    expect(() => horasUtcDesdeEpoch([NaN])).toThrow('epoch');
    expect(() => horasUtcDesdeEpoch([Infinity])).toThrow('epoch');
  });

  test('lanza con arreglo vacío', () => {
    expect(() => horasUtcDesdeEpoch([])).toThrow('no vacío');
  });

  test('lanza con no-arreglo y con null', () => {
    expect(() => horasUtcDesdeEpoch(undefined)).toThrow();
    expect(() => horasUtcDesdeEpoch(null)).toThrow();
    expect(() => horasUtcDesdeEpoch(1790748000)).toThrow();
  });
});

describe('zonaDeRespuesta', () => {
  test('devuelve la zona IANA que reporta la API', () => {
    expect(zonaDeRespuesta({ timezone: 'America/Tijuana' })).toBe('America/Tijuana');
  });

  test('devuelve null con abreviaturas, zonas inventadas y valores ausentes', () => {
    expect(zonaDeRespuesta({ timezone: 'GMT' })).toBeNull();
    expect(zonaDeRespuesta({ timezone: 'UTC' })).toBeNull();
    expect(zonaDeRespuesta({ timezone: 'Etc/GMT+6' })).toBeNull();
    expect(zonaDeRespuesta({ timezone: 'America/Inventada' })).toBeNull();
    expect(zonaDeRespuesta({})).toBeNull();
    expect(zonaDeRespuesta({ timezone: 42 })).toBeNull();
  });
});
