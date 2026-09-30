import { config } from '../config';
import type { Nowcast } from '../domain/types';
import { MS_HORA } from '../utils/horas';

export interface EntradaMezcla {
  horasUtc: string[];
  popEnsamble: number[];
  nowcast: Nowcast | null;
  ahoraMs: number;
}

export interface ResultadoMezcla {
  /** PoP final por hora: `w·radar + (1 − w)·ensamble`. */
  pop: number[];
  /** PoP del radar en esa hora, o `null` si el radar no aporta. */
  popRadar: (number | null)[];
  /** Peso del radar, 0–1. */
  pesoRadar: number[];
}

/** Peso del radar según el horizonte desde su último frame: lineal de `inicial` a 0. */
export function pesoPorHorizonte(
  horizonteMin: number,
  inicial: number = config.mezcla.pesoRadarInicial,
  finMin: number = config.radar.horizonteMin,
): number {
  return inicial * Math.max(0, 1 - Math.max(0, horizonteMin) / finMin);
}

/**
 * Mezcla la PoP del ensamble con la del radar hora por hora.
 *
 * La etiqueta `T` cubre `(T − 1 h, T]`. Para cada hora se toma el máximo de los pasos del radar
 * que caen dentro de ese intervalo (llueve en algún momento de la hora) y se pesa según el
 * horizonte del tramo que aún no ha ocurrido. Las horas ya terminadas conservan el ensamble.
 */
export function mezclarPop(entrada: EntradaMezcla): ResultadoMezcla {
  const { horasUtc, popEnsamble, nowcast, ahoraMs } = entrada;
  const pasos = nowcast ? [...nowcast.observados, ...nowcast.pronostico] : [];
  const factorMovimiento =
    nowcast?.movimiento.estado === 'incierto' ? config.mezcla.factorMovimientoIncierto : 1;

  const pop: number[] = [];
  const popRadar: (number | null)[] = [];
  const pesoRadar: number[] = [];

  horasUtc.forEach((hora, i) => {
    const ensamble = popEnsamble[i] ?? 0;
    const finMs = Date.parse(hora);
    const inicioMs = finMs - MS_HORA;
    const enVentana = nowcast && finMs > ahoraMs ? pasos.filter((p) => p.tMs >= inicioMs && p.tMs <= finMs) : [];
    const utiles = enVentana.filter((p) => p.cobertura >= config.radar.coberturaMinimaPaso);

    if (!nowcast || utiles.length === 0) {
      pop.push(ensamble);
      popRadar.push(null);
      pesoRadar.push(0);
      return;
    }

    const radar = Math.max(...utiles.map((p) => p.pop));
    const coberturaMedia = enVentana.reduce((suma, p) => suma + p.cobertura, 0) / enVentana.length;
    const mitadFuturaMs = (Math.max(inicioMs, ahoraMs) + finMs) / 2;
    const horizonteMin = (mitadFuturaMs - nowcast.tFrameMs) / 60_000;
    const peso = pesoPorHorizonte(horizonteMin) * coberturaMedia * factorMovimiento;

    pop.push(Math.min(1, Math.max(0, peso * radar + (1 - peso) * ensamble)));
    popRadar.push(radar);
    pesoRadar.push(peso);
  });

  return { pop, popRadar, pesoRadar };
}
