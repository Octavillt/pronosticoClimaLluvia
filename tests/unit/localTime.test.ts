import { describe, expect, test } from 'vitest';
import { formatHoraLocal } from '../../src/utils/localTime';

describe('formatHoraLocal', () => {
  test('convierte UTC a hora de Ciudad de México', () => {
    expect(formatHoraLocal('2026-09-24T18:30:00Z', 'America/Mexico_City')).toBe('12:30');
  });

  test('respeta otra zona horaria', () => {
    expect(formatHoraLocal('2026-09-24T18:30:00Z', 'America/Tijuana')).toBe('11:30');
  });

  test('sin zona horaria devuelve formato HH:mm local', () => {
    const resultado = formatHoraLocal('2026-09-24T18:30:00Z');
    expect(resultado).toMatch(/^\d{2}:\d{2}$/);
  });

  test('lanza error con fecha inválida', () => {
    expect(() => formatHoraLocal('no-es-fecha')).toThrow('Fecha inválida');
  });
});
