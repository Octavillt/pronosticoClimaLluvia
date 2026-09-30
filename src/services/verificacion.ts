import { config } from '../config';
import type { Observacion, ParVerificado, Prediccion } from '../domain/types';
import { MS_HORA } from '../utils/horas';

/** Cota superior del horizonte al que pertenece una PoP emitida `horas` antes del fin de su hora. */
export function horizonteDe(
  horas: number,
  horizontes: readonly number[] = config.verificacion.horizontesH,
): number | null {
  if (!(horas > 0)) {
    return null;
  }
  return horizontes.find((h) => horas <= h) ?? null;
}

export function etiquetaHorizonte(
  horizonteH: number,
  horizontes: readonly number[] = config.verificacion.horizontesH,
): string {
  const i = horizontes.indexOf(horizonteH);
  return `${i > 0 ? horizontes[i - 1] : 0}–${horizonteH} h`;
}

export interface EntradaPredicciones {
  celda: string;
  emitidoMs: number;
  horasUtc: string[];
  pop: number[];
  popEnsamble: number[];
  pesoRadar: number[];
}

/** Una predicción por cada hora futura dentro del alcance; las horas ya terminadas no se guardan. */
export function crearPredicciones(entrada: EntradaPredicciones): Prediccion[] {
  const { celda, emitidoMs, horasUtc, pop, popEnsamble, pesoRadar } = entrada;
  const resultado: Prediccion[] = [];
  horasUtc.forEach((hora, i) => {
    const finMs = Date.parse(hora);
    const horizonteH = horizonteDe((finMs - emitidoMs) / MS_HORA);
    if (horizonteH === null || pop[i] === undefined || popEnsamble[i] === undefined) {
      return;
    }
    resultado.push({
      id: `${celda}|${finMs}|${horizonteH}`,
      celda,
      finMs,
      emitidoMs,
      horizonteH,
      pop: pop[i],
      popEnsamble: popEnsamble[i],
      pesoRadar: pesoRadar[i] ?? 0,
    });
  });
  return resultado;
}

export interface HorasResueltas {
  /** `celda|finMs` → ¿llovió en algún momento de esa hora? */
  resueltas: Map<string, boolean>;
  /** Horas terminadas con observaciones, pero muy pocas para saber si llovió. */
  insuficientes: number;
}

/**
 * Convierte observaciones sueltas en el resultado de cada hora.
 *
 * La PoP es "llueve ≥ 0.2 mm en la hora", pero una observación solo dice si llovía en ese
 * instante. Por eso una hora se da por resuelta únicamente si se observaron al menos
 * `ventanasMinimasPorHora` ventanas de 10 min, y llovió si en alguna se vio lluvia. La regla es
 * la misma para las horas secas y las mojadas: si bastara un "sí" para resolver pero hicieran
 * falta varios "no", la muestra saldría inflada de horas con lluvia.
 */
export function resolverHoras(observaciones: Observacion[], ahoraMs: number): HorasResueltas {
  const ventanaMs = config.verificacion.ventanaMin * 60_000;
  // hora → (ventana → ¿se vio lluvia en ella?). Las ventanas y las horas se rotulan por su final.
  const horas = new Map<string, Map<number, boolean>>();
  for (const obs of observaciones) {
    const finHoraMs = Math.ceil(obs.tMs / MS_HORA) * MS_HORA;
    if (finHoraMs > ahoraMs) {
      continue;
    }
    const clave = `${obs.celda}|${finHoraMs}`;
    const ventana = Math.ceil(obs.tMs / ventanaMs);
    const ventanas = horas.get(clave) ?? new Map<number, boolean>();
    ventanas.set(ventana, (ventanas.get(ventana) ?? false) || obs.lluvia);
    horas.set(clave, ventanas);
  }
  const resueltas = new Map<string, boolean>();
  let insuficientes = 0;
  for (const [clave, ventanas] of horas) {
    if (ventanas.size >= config.verificacion.ventanasMinimasPorHora) {
      resueltas.set(clave, [...ventanas.values()].some(Boolean));
    } else {
      insuficientes += 1;
    }
  }
  return { resueltas, insuficientes };
}

export function emparejar(predicciones: Prediccion[], resueltas: Map<string, boolean>): ParVerificado[] {
  const pares: ParVerificado[] = [];
  for (const p of predicciones) {
    const llovio = resueltas.get(`${p.celda}|${p.finMs}`);
    if (llovio !== undefined) {
      pares.push({
        horizonteH: p.horizonteH,
        pop: p.pop,
        popEnsamble: p.popEnsamble,
        pesoRadar: p.pesoRadar,
        observado: llovio ? 1 : 0,
      });
    }
  }
  return pares;
}

/** Error cuadrático medio entre la probabilidad y lo ocurrido (0 = perfecto). Sin datos, `null`. */
export function brier(pares: { p: number; o: number }[]): number | null {
  if (pares.length === 0) {
    return null;
  }
  return pares.reduce((suma, { p, o }) => suma + (p - o) ** 2, 0) / pares.length;
}

export interface BinConfiabilidad {
  desde: number;
  hasta: number;
  n: number;
  /** PoP media emitida en la caja. */
  popMedia: number;
  /** Fracción de horas en que sí llovió. */
  frecuencia: number;
}

/** Diagrama de confiabilidad: por cada caja de PoP, cuánto llovió de verdad. Omite las vacías. */
export function tablaConfiabilidad(
  pares: ParVerificado[],
  bins: number = config.verificacion.binsConfiabilidad,
): BinConfiabilidad[] {
  const cajas = Array.from({ length: bins }, () => ({ n: 0, sumaPop: 0, sumaObs: 0 }));
  for (const par of pares) {
    const i = Math.min(bins - 1, Math.floor(par.pop * bins));
    cajas[i].n += 1;
    cajas[i].sumaPop += par.pop;
    cajas[i].sumaObs += par.observado;
  }
  return cajas.flatMap((caja, i) =>
    caja.n === 0
      ? []
      : [
          {
            desde: i / bins,
            hasta: (i + 1) / bins,
            n: caja.n,
            popMedia: caja.sumaPop / caja.n,
            frecuencia: caja.sumaObs / caja.n,
          },
        ],
  );
}

export interface FilaHorizonte {
  horizonteH: number;
  n: number;
  frecuencia: number;
  brier: number;
  brierEnsamble: number;
  /** Pares que aún faltan para calibrar este horizonte; 0 si ya se calibra. */
  faltan: number;
}

export interface ResumenExactitud {
  observaciones: number;
  horasVerificadas: number;
  horasInsuficientes: number;
  pares: number;
  /** Frecuencia observada, Brier de la mezcla, del ensamble solo y de la climatología. */
  global: { frecuencia: number; brier: number; brierEnsamble: number; brierClimatologia: number } | null;
  /** Skill frente a decir siempre la frecuencia media: 1 es perfecto, 0 no mejora nada, <0 empeora. */
  skill: number | null;
  /** Solo los pares donde el radar pesaba: lo que aporta sobre el ensamble solo. */
  conRadar: { n: number; brier: number; brierEnsamble: number } | null;
  porHorizonte: FilaHorizonte[];
  confiabilidad: BinConfiabilidad[];
}

export function resumirExactitud(
  predicciones: Prediccion[],
  observaciones: Observacion[],
  ahoraMs: number,
): ResumenExactitud {
  const { resueltas, insuficientes } = resolverHoras(observaciones, ahoraMs);
  const pares = emparejar(predicciones, resueltas);
  const { horizontesH, paresMinimosCalibracion, pesoRadarSignificativo } = config.verificacion;

  const brierDe = (lista: ParVerificado[], campo: 'pop' | 'popEnsamble') =>
    brier(lista.map((p) => ({ p: p[campo], o: p.observado }))) ?? 0;

  let global: ResumenExactitud['global'] = null;
  let skill: number | null = null;
  if (pares.length > 0) {
    const frecuencia = pares.reduce((s, p) => s + p.observado, 0) / pares.length;
    const brierClimatologia = frecuencia * (1 - frecuencia);
    global = {
      frecuencia,
      brier: brierDe(pares, 'pop'),
      brierEnsamble: brierDe(pares, 'popEnsamble'),
      brierClimatologia,
    };
    skill = brierClimatologia > 0 ? 1 - global.brier / brierClimatologia : null;
  }

  const paresRadar = pares.filter((p) => p.pesoRadar > pesoRadarSignificativo);
  const porHorizonte: FilaHorizonte[] = horizontesH.flatMap((horizonteH) => {
    const lista = pares.filter((p) => p.horizonteH === horizonteH);
    return lista.length === 0
      ? []
      : [
          {
            horizonteH,
            n: lista.length,
            frecuencia: lista.reduce((s, p) => s + p.observado, 0) / lista.length,
            brier: brierDe(lista, 'pop'),
            brierEnsamble: brierDe(lista, 'popEnsamble'),
            faltan: Math.max(0, paresMinimosCalibracion - lista.length),
          },
        ];
  });

  return {
    observaciones: observaciones.length,
    horasVerificadas: resueltas.size,
    horasInsuficientes: insuficientes,
    pares: pares.length,
    global,
    skill,
    conRadar:
      paresRadar.length === 0
        ? null
        : {
            n: paresRadar.length,
            brier: brierDe(paresRadar, 'pop'),
            brierEnsamble: brierDe(paresRadar, 'popEnsamble'),
          },
    porHorizonte,
    confiabilidad: tablaConfiabilidad(pares),
  };
}
