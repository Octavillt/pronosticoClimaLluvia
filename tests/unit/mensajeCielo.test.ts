import { describe, expect, test } from 'vitest';
import type { EstadoRadar } from '../../src/domain/types';
import { MS_HORA } from '../../src/utils/horas';
import { NBSP } from '../../src/utils/lluvia';
import {
  cruceDeUmbral,
  fraseDelCielo,
  resumirCielo,
  textoChipRadar,
} from '../../src/utils/mensajeCielo';
import type { EntradaCielo } from '../../src/utils/mensajeCielo';

const CDMX = 'America/Mexico_City';
const TIJUANA = 'America/Tijuana';
/** Miércoles 30-sep a las 20:36 en CDMX (19:36 en Tijuana). */
const AHORA_MS = Date.parse('2026-10-01T02:36:00Z');
/** Primera etiqueta de la serie: fin del intervalo 20:00–21:00 en CDMX. */
const INICIO = '2026-10-01T03:00:00Z';

function serie(inicioUtc: string, porcentajes: number[]): { horasUtc: string[]; pop: number[] } {
  const base = Date.parse(inicioUtc);
  return {
    horasUtc: porcentajes.map((_, i) => new Date(base + i * MS_HORA).toISOString()),
    pop: porcentajes.map((p) => p / 100),
  };
}

function frase(
  porcentajes: number[],
  opciones: {
    inicio?: string;
    indice?: number;
    ahoraMs?: number;
    timezone?: string;
  } = {},
): string | null {
  const s = serie(opciones.inicio ?? INICIO, porcentajes);
  return fraseDelCielo({
    horasUtc: s.horasUtc,
    pop: s.pop,
    indice: opciones.indice ?? 0,
    ahoraMs: opciones.ahoraMs ?? AHORA_MS,
    timezone: opciones.timezone ?? CDMX,
  });
}

function entrada(
  porcentajes: number[],
  opciones: {
    inicio?: string;
    indice?: number;
    ahoraMs?: number;
    timezone?: string;
    pesoRadar?: number[];
    radar?: EstadoRadar;
  } = {},
): EntradaCielo {
  const s = serie(opciones.inicio ?? INICIO, porcentajes);
  return {
    horasUtc: s.horasUtc,
    pop: s.pop,
    pesoRadar: opciones.pesoRadar ?? porcentajes.map(() => 0),
    indice: opciones.indice ?? 0,
    ahoraMs: opciones.ahoraMs ?? AHORA_MS,
    timezone: opciones.timezone ?? CDMX,
    radar: opciones.radar ?? { estado: 'cargando' },
  };
}

describe('cruceDeUmbral', () => {
  const bajo10 = (p: number) => p < 10;

  test('un valor aislado bajo el umbral no cuenta como cruce', () => {
    expect(cruceDeUmbral([72, 40, 8, 25, 5, 4], 1, 5, bajo10, 2)).toBe(4);
  });

  test('una racha que llega al final con menos horas de las exigidas cuenta', () => {
    expect(cruceDeUmbral([50, 5, 4], 0, 2, bajo10, 3)).toBe(1);
  });

  test('hasta limita dónde puede empezar el cruce, no dónde termina la racha', () => {
    expect(cruceDeUmbral([50, 5, 4], 0, 0, bajo10, 2)).toBeNull();
    expect(cruceDeUmbral([50, 5, 4, 3], 0, 1, bajo10, 3)).toBe(1);
  });

  test('un undefined o NaN termina la serie: nada después cuenta', () => {
    expect(cruceDeUmbral([72, Number.NaN, 5, 4] as number[], 1, 3, bajo10, 2)).toBeNull();
    expect(cruceDeUmbral([72, 5, undefined, 4] as unknown as number[], 1, 3, bajo10, 2)).toBe(1);
    expect(cruceDeUmbral([72, 5, undefined, 4] as unknown as number[], 3, 3, bajo10, 2)).toBeNull();
  });

  test('sin cruce devuelve null', () => {
    expect(cruceDeUmbral([72, 40, 35], 1, 2, bajo10, 2)).toBeNull();
    expect(cruceDeUmbral([5, 4], 0, 1, (p) => p >= 30, 1)).toBeNull();
  });

  test('desde fuera de la serie devuelve null', () => {
    expect(cruceDeUmbral([5, 4], 5, 9, bajo10, 2)).toBeNull();
    expect(cruceDeUmbral([5, 4], 2, 1, bajo10, 2)).toBeNull();
  });
});

describe('fraseDelCielo', () => {
  test('con nivel alto anuncia cuándo baja de 10 %', () => {
    // La hora del 8 % empieza a las 22:00 CDMX: la etiqueta 05:00Z menos una hora.
    expect(frase([72, 40, 8, 5, 4])).toBe(`Baja a menos de 10${NBSP}% desde las 22:00.`);
  });

  test('cita el sufijo de día cuando el cruce cae después de la medianoche local', () => {
    // El cruce (índice 6) empieza a las 02:00 del jueves 1-oct en CDMX.
    expect(frase([70, 40, 40, 40, 40, 40, 5, 5])).toBe(
      `Baja a menos de 10${NBSP}% desde las 02:00 de mañana.`,
    );
  });

  test('si nunca baja de 10 pero sí de 30, cita 30 %', () => {
    expect(frase([70, 40, 25, 25])).toBe(`Baja a menos de 30${NBSP}% desde las 22:00.`);
  });

  test('si no baja de 30 en toda la ventana, dice que sigue probable', () => {
    expect(frase([70, ...Array(24).fill(40)])).toBe(
      'Sigue siendo probable la lluvia las próximas 24 horas.',
    );
  });

  test('con nivel bajo o nulo anuncia cuándo sube, con el porcentaje de esa hora', () => {
    expect(frase([3, 5, 45])).toBe(`La probabilidad sube a 45${NBSP}% desde las 22:00.`);
    expect(frase([20, 70, 5])).toBe(`La probabilidad sube a 70${NBSP}% desde las 21:00.`);
  });

  test('sin subida se mantiene seco o por debajo de 30 %', () => {
    expect(frase([3, ...Array(24).fill(5)])).toBe('Se mantiene seco las próximas 24 horas.');
    expect(frase([20, ...Array(24).fill(25)])).toBe(
      `Se mantiene por debajo de 30${NBSP}% las próximas 24 horas.`,
    );
  });

  test('la ventana se recorta a las horas que hay', () => {
    expect(frase([70, ...Array(7).fill(40)])).toBe(
      'Sigue siendo probable la lluvia las próximas 7 horas.',
    );
    expect(frase([70, 40])).toBe('Sigue siendo probable la lluvia la próxima hora.');
    expect(frase([20, ...Array(7).fill(25)])).toBe(
      `Se mantiene por debajo de 30${NBSP}% las próximas 7 horas.`,
    );
  });

  test('sin horas futuras o con índice fuera de rango devuelve null', () => {
    expect(frase([70])).toBeNull();
    expect(frase([70, 40], { indice: 5 })).toBeNull();
    expect(frase([70, 40], { indice: -1 })).toBeNull();
  });

  test('un pop más corto que horasUtc se trata como fin de serie', () => {
    const s = serie(INICIO, [70, 40, 40, 40, 40]);
    const resultado = fraseDelCielo({
      horasUtc: s.horasUtc,
      pop: [0.7, 0.4],
      indice: 0,
      ahoraMs: AHORA_MS,
      timezone: CDMX,
    });
    expect(resultado).toBe('Sigue siendo probable la lluvia la próxima hora.');

    const conCruce = fraseDelCielo({
      horasUtc: s.horasUtc,
      pop: [0.7, 0.05, 0.04],
      indice: 0,
      ahoraMs: AHORA_MS,
      timezone: CDMX,
    });
    expect(conCruce).toBe(`Baja a menos de 10${NBSP}% desde las 21:00.`);
  });

  test('con la hora en curso casi terminada cita la hora siguiente', () => {
    // 20:57 en CDMX: la hora en curso termina a las 21:00 y la siguiente empieza a esa hora.
    expect(frase([80, 5, 5], { ahoraMs: Date.parse('2026-10-01T02:57:00Z') })).toBe(
      `Baja a menos de 10${NBSP}% desde las 21:00.`,
    );
  });

  test('el mismo instante da horas distintas en Tijuana y en CDMX', () => {
    expect(frase([72, 40, 8, 5, 4], { timezone: CDMX })).toBe(
      `Baja a menos de 10${NBSP}% desde las 22:00.`,
    );
    expect(frase([72, 40, 8, 5, 4], { timezone: TIJUANA })).toBe(
      `Baja a menos de 10${NBSP}% desde las 21:00.`,
    );
  });

  test('el día de 25 horas no confunde el sufijo de mañana en Tijuana', () => {
    // Sábado 31-oct 23:00 PDT; el cruce (índice 3) empieza a la 01:00 del domingo, ya con UTC−8.
    expect(
      frase([72, 40, 40, 8, 5, 4], {
        inicio: '2026-11-01T07:00:00Z',
        ahoraMs: Date.parse('2026-11-01T06:00:00Z'),
        timezone: TIJUANA,
      }),
    ).toBe(`Baja a menos de 10${NBSP}% desde las 01:00 de mañana.`);
  });
});

describe('textoChipRadar', () => {
  test('cargando', () => {
    expect(textoChipRadar({ estado: 'cargando' }, CDMX)).toEqual({
      texto: 'Radar: consultando…',
      tono: 'neutro',
    });
  });

  test('con avance apreciable dice velocidad y rumbo', () => {
    expect(
      textoChipRadar(
        { estado: 'ok', tFrameMs: AHORA_MS, avance: { kmh: 28.4, haciaGrados: 90 } },
        CDMX,
      ),
    ).toEqual({ texto: `Radar: avanza a 28${NBSP}km/h al este`, tono: 'ok' });
  });

  test('con avance de menos de 1 km/h o sin avance cita la imagen', () => {
    const tFrameMs = Date.parse('2026-10-01T01:58:00Z');
    expect(
      textoChipRadar({ estado: 'ok', tFrameMs, avance: { kmh: 0.4, haciaGrados: 90 } }, CDMX),
    ).toEqual({ texto: 'Radar: imagen de las 19:58 h', tono: 'ok' });
    expect(textoChipRadar({ estado: 'ok', tFrameMs, avance: null }, CDMX)).toEqual({
      texto: 'Radar: imagen de las 19:58 h',
      tono: 'ok',
    });
  });

  test('la hora de la imagen se formatea en la zona del punto', () => {
    const radar: EstadoRadar = {
      estado: 'ok',
      tFrameMs: Date.parse('2026-10-01T01:58:00Z'),
      avance: null,
    };
    expect(textoChipRadar(radar, TIJUANA).texto).toBe('Radar: imagen de las 18:58 h');
  });

  test('los 8 rumbos salen con su nombre', () => {
    const rumbos: Array<[number, string]> = [
      [0, 'al norte'],
      [45, 'al noreste'],
      [90, 'al este'],
      [135, 'al sureste'],
      [180, 'al sur'],
      [225, 'al suroeste'],
      [270, 'al oeste'],
      [315, 'al noroeste'],
    ];
    for (const [haciaGrados, rumbo] of rumbos) {
      const chip = textoChipRadar(
        { estado: 'ok', tFrameMs: AHORA_MS, avance: { kmh: 10, haciaGrados } },
        CDMX,
      );
      expect(chip).toEqual({ texto: `Radar: avanza a 10${NBSP}km/h ${rumbo}`, tono: 'ok' });
    }
  });

  test('sin cobertura, desactualizado y error', () => {
    expect(textoChipRadar({ estado: 'sin-cobertura' }, CDMX)).toEqual({
      texto: 'Radar: sin cobertura aquí',
      tono: 'aviso',
    });
    expect(textoChipRadar({ estado: 'desactualizado', edadMin: 54.6 }, CDMX)).toEqual({
      texto: 'Radar: imagen de hace 55 min, no se usa',
      tono: 'aviso',
    });
    expect(textoChipRadar({ estado: 'error', mensaje: 'boom' }, CDMX)).toEqual({
      texto: 'Radar no disponible',
      tono: 'aviso',
    });
  });
});

describe('resumirCielo', () => {
  test('resume la hora en curso con su etiqueta local', () => {
    const resumen = resumirCielo(entrada([72, 40, 8, 5, 4]));
    expect(resumen.porcentaje).toBe(72);
    expect(resumen.nivel).toBe('alta');
    expect(resumen.accion).toBe('Lleva paraguas.');
    expect(resumen.frase).toBe(`Baja a menos de 10${NBSP}% desde las 22:00.`);
    expect(resumen.etiquetaHora).toBe('Ahora · 20:00 a 21:00 h');
    expect(resumen.conRadar).toBe(false);
    expect(resumen.vencido).toBe(false);
    expect(resumen.chipRadar).toEqual({ texto: 'Radar: consultando…', tono: 'neutro' });
  });

  test('la etiqueta de hora cambia con la zona del punto', () => {
    expect(resumirCielo(entrada([72, 40, 8, 5, 4], { timezone: TIJUANA })).etiquetaHora).toBe(
      'Ahora · 19:00 a 20:00 h',
    );
  });

  test('conRadar exige un peso estrictamente mayor que el umbral', () => {
    expect(resumirCielo(entrada([72, 40], { pesoRadar: [0.05, 0] })).conRadar).toBe(false);
    expect(resumirCielo(entrada([72, 40], { pesoRadar: [0.0501, 0] })).conRadar).toBe(true);
  });

  test('la frase no cambia con o sin radar; solo cambia el chip', () => {
    const sinRadar = resumirCielo(entrada([72, 40, 8, 5, 4]));
    const conRadar = resumirCielo(
      entrada([72, 40, 8, 5, 4], {
        radar: { estado: 'ok', tFrameMs: AHORA_MS, avance: { kmh: 12, haciaGrados: 90 } },
      }),
    );
    expect(conRadar.frase).toBe(sinRadar.frase);
    expect(conRadar.chipRadar).toEqual({ texto: `Radar: avanza a 12${NBSP}km/h al este`, tono: 'ok' });
  });

  test('porcentaje y nivel coinciden en los bordes', () => {
    const resumen = resumirCielo(entrada([59.5, 40]));
    expect(resumen.porcentaje).toBe(60);
    expect(resumen.nivel).toBe('alta');
  });

  test('la hora en curso ya terminada deja todo en blanco', () => {
    const resumen = resumirCielo(entrada([50, 5, 5], { ahoraMs: Date.parse('2026-10-01T03:30:00Z') }));
    expect(resumen.vencido).toBe(true);
    expect(resumen.porcentaje).toBe(50);
    expect(resumen.nivel).toBe('media');
    expect(resumen.accion).toBe('');
    expect(resumen.frase).toBeNull();
    expect(resumen.etiquetaHora).toBe('');
    expect(resumen.conRadar).toBe(false);
  });

  test('un índice fuera de rango queda vencido con nivel nulo', () => {
    const resumen = resumirCielo(entrada([70, 40, 40], { indice: 5 }));
    expect(resumen.vencido).toBe(true);
    expect(resumen.porcentaje).toBe(0);
    expect(resumen.nivel).toBe('nula');
    expect(resumen.accion).toBe('');
    expect(resumirCielo(entrada([70, 40, 40], { indice: -1 })).vencido).toBe(true);
  });
});
