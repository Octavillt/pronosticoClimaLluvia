import { describe, expect, test } from 'vitest';
import { MS_HORA } from '../../src/utils/horas';
import { construirPildoras } from '../../src/utils/pildoras';

const CDMX = 'America/Mexico_City';
const TIJUANA = 'America/Tijuana';
const AHORA_MS = Date.parse('2026-10-01T02:36:00Z');
const PRIMER_FIN = '2026-10-01T03:00:00Z';

function horasConsecutivas(n: number, primerFin = PRIMER_FIN): string[] {
  const base = Date.parse(primerFin);
  return Array.from({ length: n }, (_, i) => new Date(base + i * MS_HORA).toISOString());
}

function entrada(n: number, primerFin = PRIMER_FIN): Parameters<typeof construirPildoras>[0] {
  return {
    horasUtc: horasConsecutivas(n, primerFin),
    pop: Array.from({ length: n }, () => 0.425),
    desde: 0,
    horas: n,
    ahoraMs: AHORA_MS,
    timezone: CDMX,
  };
}

describe('construirPildoras', () => {
  test('usa el inicio del intervalo y redondea el porcentaje mostrado', () => {
    expect(construirPildoras(entrada(2))).toEqual([
      { tipo: 'hora', i: 0, etiqueta: 'Ahora', porcentaje: 43, conRadar: false,
        titulo: '20:00 a 21:00 h: 43 %' },
      { tipo: 'hora', i: 1, etiqueta: '21:00', porcentaje: 43, conRadar: false,
        titulo: '21:00 a 22:00 h: 43 %' },
    ]);
  });

  test('devuelve una lista vacía cuando desde alcanza o supera la longitud', () => {
    expect(construirPildoras({ ...entrada(2), desde: 2 })).toEqual([]);
    expect(construirPildoras({ ...entrada(2), desde: 3 })).toEqual([]);
  });

  test('devuelve una lista vacía si se solicitan cero horas', () => {
    expect(construirPildoras({ ...entrada(2), horas: 0 })).toEqual([]);
  });

  test('limita la cantidad por las horas disponibles', () => {
    expect(construirPildoras({ ...entrada(2), horas: 24 })).toHaveLength(2);
  });

  test('limita la cantidad por pop aunque haya más etiquetas horarias', () => {
    const resultado = construirPildoras({ ...entrada(4), pop: [0.1, 0.2], horas: 24 });
    expect(resultado).toHaveLength(2);
    expect(resultado[1]).toMatchObject({ tipo: 'hora', i: 1, porcentaje: 20 });
  });

  test('desde selecciona los datos originales pero el índice sigue siendo relativo', () => {
    const resultado = construirPildoras({
      ...entrada(4), desde: 1, horas: 2, pop: [0.1, 0.2, 0.3, 0.4], pesoRadar: [0.9, 0, 0.1, 0],
    });
    expect(resultado).toEqual([
      { tipo: 'hora', i: 0, etiqueta: 'Ahora', porcentaje: 20, conRadar: false,
        titulo: '21:00 a 22:00 h: 20 %' },
      { tipo: 'hora', i: 1, etiqueta: '22:00', porcentaje: 30, conRadar: true,
        titulo: '22:00 a 23:00 h: 30 %' },
    ]);
  });

  test('separa las medianoches sin desplazar los índices de hora', () => {
    const resultado = construirPildoras(entrada(40));
    // Desde miércoles 20:00: jueves 00:00 es j=4 y viernes 00:00 es j=28.
    expect(resultado).toHaveLength(42);
    expect(resultado.filter((p) => p.tipo === 'dia')).toEqual([
      { tipo: 'dia', etiqueta: 'Mañana' },
      { tipo: 'dia', etiqueta: 'Pasado mañana' },
    ]);
    expect(resultado[3]).toMatchObject({ tipo: 'hora', i: 3, etiqueta: '23:00' });
    expect(resultado[4]).toEqual({ tipo: 'dia', etiqueta: 'Mañana' });
    expect(resultado[5]).toMatchObject({ tipo: 'hora', i: 4, etiqueta: '00:00' });
    expect(resultado[28]).toMatchObject({ tipo: 'hora', i: 27, etiqueta: '23:00' });
    expect(resultado[29]).toEqual({ tipo: 'dia', etiqueta: 'Pasado mañana' });
    expect(resultado[30]).toMatchObject({ tipo: 'hora', i: 28, etiqueta: '00:00' });
    expect(resultado.filter((p) => p.tipo === 'hora').map((p) => p.i))
      .toEqual(Array.from({ length: 40 }, (_, i) => i));
  });

  test('capitaliza el nombre de día fuera de hoy, mañana y pasado mañana', () => {
    const resultado = construirPildoras(entrada(77));
    expect(resultado.filter((p) => p.tipo === 'dia')).toEqual([
      { tipo: 'dia', etiqueta: 'Mañana' },
      { tipo: 'dia', etiqueta: 'Pasado mañana' },
      { tipo: 'dia', etiqueta: 'Sábado' },
      { tipo: 'dia', etiqueta: 'Domingo' },
    ]);
  });

  test('no inserta un separador antes de la primera hora aunque sea mañana', () => {
    expect(construirPildoras(entrada(1, '2026-10-01T07:00:00Z'))).toEqual([
      { tipo: 'hora', i: 0, etiqueta: 'Ahora', porcentaje: 43, conRadar: false,
        titulo: '00:00 a 01:00 h: 43 %' },
    ]);
  });

  test('las dos 01:00 del domingo de 25 horas en Tijuana pertenecen al mismo día', () => {
    const resultado = construirPildoras({
      ...entrada(28, '2026-11-01T07:00:00Z'),
      ahoraMs: Date.parse('2026-11-01T06:00:00Z'),
      timezone: TIJUANA,
    });
    // Sábado 23:00 PDT; domingo 00:00, 01:00 PDT, 01:00 PST, 02:00 PST.
    expect(resultado.slice(0, 6)).toEqual([
      { tipo: 'hora', i: 0, etiqueta: 'Ahora', porcentaje: 43, conRadar: false,
        titulo: '23:00 a 00:00 h: 43 %' },
      { tipo: 'dia', etiqueta: 'Mañana' },
      { tipo: 'hora', i: 1, etiqueta: '00:00', porcentaje: 43, conRadar: false,
        titulo: '00:00 a 01:00 h: 43 %' },
      { tipo: 'hora', i: 2, etiqueta: '01:00', porcentaje: 43, conRadar: false,
        titulo: '01:00 a 01:00 h: 43 %' },
      { tipo: 'hora', i: 3, etiqueta: '01:00', porcentaje: 43, conRadar: false,
        titulo: '01:00 a 02:00 h: 43 %' },
      { tipo: 'hora', i: 4, etiqueta: '02:00', porcentaje: 43, conRadar: false,
        titulo: '02:00 a 03:00 h: 43 %' },
    ]);
    // El lunes inicia en j=26: una hora del sábado y las 25 horas del domingo.
    expect(resultado[26]).toMatchObject({ tipo: 'hora', i: 25, etiqueta: '23:00' });
    expect(resultado[27]).toEqual({ tipo: 'dia', etiqueta: 'Pasado mañana' });
    expect(resultado[28]).toMatchObject({ tipo: 'hora', i: 26, etiqueta: '00:00' });
    expect(resultado.filter((p) => p.tipo === 'dia')).toHaveLength(2);
  });

  test('el radar debe superar estrictamente el umbral y los pesos ausentes valen cero', () => {
    const resultado = construirPildoras({ ...entrada(3), pesoRadar: [0.05, 0.0501] });
    expect(resultado.map((p) => p.tipo === 'hora' && p.conRadar)).toEqual([false, true, false]);
    expect(construirPildoras(entrada(1))[0]).toMatchObject({ conRadar: false });
  });

  test('el título tiene un espacio normal antes de % para el consumidor E2E', () => {
    const [pildora] = construirPildoras(entrada(1));
    expect(pildora.tipo).toBe('hora');
    if (pildora.tipo === 'hora') {
      expect(pildora.titulo).not.toContain('\u00a0');
      expect(pildora.titulo).toMatch(/(\d+) %/);
    }
  });

  test('el mismo instante tiene etiquetas y títulos distintos en Tijuana y CDMX', () => {
    const cdmx = construirPildoras(entrada(2));
    const tijuana = construirPildoras({ ...entrada(2), timezone: TIJUANA });
    expect(cdmx[0]).toMatchObject({ titulo: '20:00 a 21:00 h: 43 %' });
    expect(cdmx[1]).toMatchObject({ etiqueta: '21:00' });
    expect(tijuana[0]).toMatchObject({ titulo: '19:00 a 20:00 h: 43 %' });
    expect(tijuana[1]).toMatchObject({ etiqueta: '20:00' });
  });

  test('no modifica las entradas', () => {
    const e = { ...entrada(7), pesoRadar: [0.05, 0.0501] };
    const copia = structuredClone(e);
    Object.freeze(e.horasUtc);
    Object.freeze(e.pop);
    Object.freeze(e.pesoRadar);
    Object.freeze(e);
    construirPildoras(e);
    expect(e).toEqual(copia);
  });
});
