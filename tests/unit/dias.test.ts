import { describe, expect, test } from 'vitest';
import { claveDia, diasDeDiferencia, etiquetaDia } from '../../src/utils/dias';

const CDMX = 'America/Mexico_City';
const TIJUANA = 'America/Tijuana';
const CANCUN = 'America/Cancun';

describe('claveDia', () => {
  test('el mismo instante cae en el 30-sep tanto en CDMX como en Tijuana', () => {
    expect(claveDia(Date.parse('2026-10-01T02:36:00Z'), CDMX)).toBe('2026-09-30');
    expect(claveDia(Date.parse('2026-10-01T02:36:00Z'), TIJUANA)).toBe('2026-09-30');
  });

  test('el día cambia a las 00:00 locales de CDMX (06:00Z)', () => {
    expect(claveDia(Date.parse('2026-10-01T05:59:59Z'), CDMX)).toBe('2026-09-30');
    expect(claveDia(Date.parse('2026-10-01T06:00:00Z'), CDMX)).toBe('2026-10-01');
  });

  test('el día cambia a las 00:00 locales de Tijuana (07:00Z en septiembre)', () => {
    expect(claveDia(Date.parse('2026-10-01T06:59:59Z'), TIJUANA)).toBe('2026-09-30');
    expect(claveDia(Date.parse('2026-10-01T07:00:00Z'), TIJUANA)).toBe('2026-10-01');
  });

  test('el día cambia a las 00:00 locales de Cancún (05:00Z, sin horario de verano)', () => {
    expect(claveDia(Date.parse('2026-10-01T04:59:59Z'), CANCUN)).toBe('2026-09-30');
    expect(claveDia(Date.parse('2026-10-01T05:00:00Z'), CANCUN)).toBe('2026-10-01');
  });
});

describe('diasDeDiferencia y etiquetaDia', () => {
  // Miércoles 30-sep a las 20:36 en CDMX.
  const AHORA_MS = Date.parse('2026-10-01T02:36:00Z');

  test('cuenta días de calendario locales desde el miércoles', () => {
    expect(diasDeDiferencia(Date.parse('2026-10-01T03:30:00Z'), AHORA_MS, CDMX)).toBe(0);
    expect(etiquetaDia(Date.parse('2026-10-01T03:30:00Z'), AHORA_MS, CDMX)).toBe('hoy');
    expect(diasDeDiferencia(Date.parse('2026-10-01T06:00:00Z'), AHORA_MS, CDMX)).toBe(1);
    expect(etiquetaDia(Date.parse('2026-10-01T06:00:00Z'), AHORA_MS, CDMX)).toBe('mañana');
    expect(diasDeDiferencia(Date.parse('2026-10-02T06:00:00Z'), AHORA_MS, CDMX)).toBe(2);
    expect(etiquetaDia(Date.parse('2026-10-02T06:00:00Z'), AHORA_MS, CDMX)).toBe('pasado mañana');
    expect(diasDeDiferencia(Date.parse('2026-10-03T06:00:00Z'), AHORA_MS, CDMX)).toBe(3);
    expect(etiquetaDia(Date.parse('2026-10-03T06:00:00Z'), AHORA_MS, CDMX)).toBe('sábado');
  });

  test('un día atrás da diferencia negativa y nombre de día', () => {
    // 06:00 del martes 29-sep en CDMX.
    const ms = Date.parse('2026-09-29T12:00:00Z');
    expect(diasDeDiferencia(ms, AHORA_MS, CDMX)).toBe(-1);
    expect(etiquetaDia(ms, AHORA_MS, CDMX)).toBe('martes');
  });

  test('el mismo instante da etiquetas distintas en zonas distintas', () => {
    const ms = Date.parse('2026-10-01T06:30:00Z');
    // 00:30 del jueves en CDMX, pero 23:30 del miércoles en Tijuana.
    expect(etiquetaDia(ms, AHORA_MS, CDMX)).toBe('mañana');
    expect(etiquetaDia(ms, AHORA_MS, TIJUANA)).toBe('hoy');
  });

  test('un día de 25 horas por el fin del horario de verano cuenta como un día', () => {
    // Sábado 31-oct a las 23:00 en Tijuana (aún en PDT).
    const ahoraMs = Date.parse('2026-11-01T06:00:00Z');
    // 23:30 del domingo 1-nov (ya con UTC−8): 25.5 h después, 1 día de calendario.
    const casiLunes = Date.parse('2026-11-02T07:30:00Z');
    expect(diasDeDiferencia(casiLunes, ahoraMs, TIJUANA)).toBe(1);
    expect(etiquetaDia(casiLunes, ahoraMs, TIJUANA)).toBe('mañana');
    // 00:00 del lunes 2-nov: 2 días de calendario.
    const lunes = Date.parse('2026-11-02T08:00:00Z');
    expect(diasDeDiferencia(lunes, ahoraMs, TIJUANA)).toBe(2);
    expect(etiquetaDia(lunes, ahoraMs, TIJUANA)).toBe('pasado mañana');
  });
});
