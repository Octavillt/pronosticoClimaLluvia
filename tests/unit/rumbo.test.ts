import { describe, expect, test } from 'vitest';
import { nombreRumbo } from '../../src/utils/rumbo';

describe('nombreRumbo', () => {
  test.each([
    [0, 'norte'],
    [45, 'noreste'],
    [90, 'este'],
    [135, 'sureste'],
    [180, 'sur'],
    [225, 'suroeste'],
    [270, 'oeste'],
    [315, 'noroeste'],
  ])('%s° es %s', (grados, nombre) => {
    expect(nombreRumbo(grados)).toBe(nombre);
  });

  test('redondea al punto más cercano', () => {
    expect(nombreRumbo(20)).toBe('norte');
    expect(nombreRumbo(25)).toBe('noreste');
    expect(nombreRumbo(359)).toBe('norte');
  });

  test('normaliza rumbos fuera de 0–360', () => {
    expect(nombreRumbo(360)).toBe('norte');
    expect(nombreRumbo(450)).toBe('este');
    expect(nombreRumbo(-90)).toBe('oeste');
  });
});
