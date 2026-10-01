import { describe, expect, test } from 'vitest';
import {
  formatHoraLocal,
  normalizarZona,
  ZONA_PREDETERMINADA,
} from '../../src/utils/localTime';

describe('formatHoraLocal', () => {
  test('convierte UTC a hora de Ciudad de México', () => {
    expect(formatHoraLocal('2026-09-24T18:30:00Z', 'America/Mexico_City')).toBe('12:30');
  });

  test('respeta otra zona horaria', () => {
    expect(formatHoraLocal('2026-09-24T18:30:00Z', 'America/Tijuana')).toBe('11:30');
  });

  test('la medianoche local sale como 00:00, nunca como 24:00', () => {
    expect(formatHoraLocal('2026-09-30T06:00:00Z', 'America/Mexico_City')).toBe('00:00');
  });

  test('la tarde local sale en formato de 24 horas', () => {
    expect(formatHoraLocal('2026-10-01T02:00:00Z', 'America/Mexico_City')).toBe('20:00');
  });

  test('sin zona horaria devuelve formato HH:mm local', () => {
    const resultado = formatHoraLocal('2026-09-24T18:30:00Z');
    expect(resultado).toMatch(/^\d{2}:\d{2}$/);
  });

  test('lanza error con fecha inválida', () => {
    expect(() => formatHoraLocal('no-es-fecha')).toThrow('Fecha inválida');
  });
});

describe('ZONA_PREDETERMINADA', () => {
  test('es una zona válida de México', () => {
    expect(ZONA_PREDETERMINADA).toBe('America/Mexico_City');
    expect(normalizarZona(ZONA_PREDETERMINADA)).toBe(ZONA_PREDETERMINADA);
  });
});

describe('normalizarZona', () => {
  test('acepta zonas IANA de América', () => {
    expect(normalizarZona('America/Mexico_City')).toBe('America/Mexico_City');
    expect(normalizarZona('America/Tijuana')).toBe('America/Tijuana');
    expect(normalizarZona('America/Cancun')).toBe('America/Cancun');
  });

  test('rechaza abreviaturas que no identifican una zona', () => {
    expect(normalizarZona('GMT')).toBeNull();
    expect(normalizarZona('UTC')).toBeNull();
    expect(normalizarZona('Etc/GMT+6')).toBeNull();
  });

  test('rechaza zonas inventadas', () => {
    expect(normalizarZona('America/Inventada')).toBeNull();
  });

  test('rechaza otros prefijos, no-cadenas y ausencia de zona', () => {
    expect(normalizarZona('Europe/Madrid')).toBeNull();
    expect(normalizarZona(42)).toBeNull();
    expect(normalizarZona(null)).toBeNull();
    expect(normalizarZona(undefined)).toBeNull();
  });
});
