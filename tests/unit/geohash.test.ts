import { describe, expect, test } from 'vitest';
import { corridaModelo, geohashEncode } from '../../src/services/geohash';

describe('geohashEncode', () => {
  test('codifica el vector conocido (42.6, -5.6) como ezs42', () => {
    expect(geohashEncode(42.6, -5.6)).toBe('ezs42');
  });

  test('por defecto genera 5 caracteres', () => {
    expect(geohashEncode(19.43, -99.13)).toHaveLength(5);
  });

  test('puntos cercanos comparten la celda de 5 caracteres', () => {
    expect(geohashEncode(19.4326, -99.1332)).toBe(geohashEncode(19.433, -99.134));
  });

  test('puntos lejanos generan celdas distintas', () => {
    expect(geohashEncode(19.43, -99.13)).not.toBe(geohashEncode(20.67, -103.35));
  });
});

describe('corridaModelo', () => {
  test('agrupa en bloques de 6 horas UTC', () => {
    expect(corridaModelo(new Date('2026-09-24T13:30:00Z'))).toBe('2026092412');
    expect(corridaModelo(new Date('2026-09-24T17:59:00Z'))).toBe('2026092412');
    expect(corridaModelo(new Date('2026-09-24T18:00:00Z'))).toBe('2026092418');
  });
});
