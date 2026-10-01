import type { EstadoRadar } from '../domain/types';
import { config } from '../config';
import { etiquetaDia } from './dias';
import { MS_HORA } from './horas';
import { formatHoraLocal } from './localTime';
import { MENSAJE_ACCION, NBSP, nivelDeLluvia, porcentajeMostrado } from './lluvia';
import type { NivelLluvia } from './lluvia';
import { nombreRumbo } from './rumbo';

export interface EntradaCielo {
  horasUtc: string[];
  pop: number[];
  pesoRadar: number[];
  indice: number;
  ahoraMs: number;
  timezone: string;
  radar: EstadoRadar;
}

export interface ChipRadar {
  texto: string;
  tono: 'ok' | 'neutro' | 'aviso';
}

export interface ResumenCielo {
  porcentaje: number;
  nivel: NivelLluvia;
  accion: string;
  frase: string | null;
  etiquetaHora: string;
  conRadar: boolean;
  chipRadar: ChipRadar;
  vencido: boolean;
}

export function cruceDeUmbral(
  porcentajes: number[],
  desde: number,
  hasta: number,
  criterio: (p: number) => boolean,
  sostener: number,
): number | null {
  // Un valor undefined/NaN termina la serie: nada después de él cuenta.
  let ultima = -1;
  while (ultima + 1 < porcentajes.length) {
    const p = porcentajes[ultima + 1];
    if (p === undefined || Number.isNaN(p)) {
      break;
    }
    ultima += 1;
  }
  const inicio = Math.max(0, desde);
  if (inicio > ultima || inicio > hasta) {
    return null;
  }
  const inicioMax = Math.min(hasta, ultima);
  for (let i = inicio; i <= inicioMax; i += 1) {
    let racha = 0;
    let llegaAlFinal = true;
    for (let j = i; j <= ultima; j += 1) {
      if (!criterio(porcentajes[j])) {
        llegaAlFinal = false;
        break;
      }
      racha += 1;
      if (racha >= sostener) {
        return i;
      }
    }
    // La racha se cortó por fin de serie, no por incumplir: cuenta como sostenido.
    if (llegaAlFinal && racha >= 1) {
      return i;
    }
  }
  return null;
}

function sufijoDia(inicioMs: number, ahoraMs: number, timezone: string): string {
  const etiqueta = etiquetaDia(inicioMs, ahoraMs, timezone);
  if (etiqueta === 'hoy') {
    return '';
  }
  if (etiqueta === 'mañana') {
    return ' de mañana';
  }
  if (etiqueta === 'pasado mañana') {
    return ' de pasado mañana';
  }
  return ` del ${etiqueta}`;
}

function duracionHoras(n: number): string {
  return n === 1 ? 'la próxima hora' : `las próximas ${n} horas`;
}

/** Inicio local del intervalo cuya etiqueta de fin es horasUtc[i], con sufijo de día si no es hoy. */
function desdeLas(horasUtc: string[], i: number, ahoraMs: number, timezone: string): string {
  const inicioMs = Date.parse(horasUtc[i]) - MS_HORA;
  const hora = formatHoraLocal(new Date(inicioMs).toISOString(), timezone);
  return `desde las ${hora}${sufijoDia(inicioMs, ahoraMs, timezone)}`;
}

export function fraseDelCielo(e: Omit<EntradaCielo, 'pesoRadar' | 'radar'>): string | null {
  const { horasUtc, pop, indice, ahoraMs, timezone } = e;
  const n = Math.min(horasUtc.length, pop.length);
  const ultima = n - 1;
  if (indice < 0 || indice + 1 > ultima) {
    return null;
  }
  // Todo se decide sobre el porcentaje mostrado: el número y el mensaje nunca se contradicen.
  const porcentajes = pop.map(porcentajeMostrado);
  const nivel = nivelDeLluvia(pop[indice]);
  const hasta = Math.min(indice + config.ui.horasBusquedaFrase, ultima);
  const N = hasta - indice;
  const { baja, media } = config.ui.umbralesPorcentaje;
  const sostener = config.ui.horasSostenidasParaBajar;

  if (nivel === 'alta' || nivel === 'media') {
    const aBaja = cruceDeUmbral(porcentajes, indice + 1, hasta, (p) => p < baja, sostener);
    if (aBaja !== null) {
      return `Baja a menos de ${baja}${NBSP}% ${desdeLas(horasUtc, aBaja, ahoraMs, timezone)}.`;
    }
    const aMedia = cruceDeUmbral(porcentajes, indice + 1, hasta, (p) => p < media, sostener);
    if (aMedia !== null) {
      return `Baja a menos de ${media}${NBSP}% ${desdeLas(horasUtc, aMedia, ahoraMs, timezone)}.`;
    }
    return `Sigue siendo probable la lluvia ${duracionHoras(N)}.`;
  }

  const sube = cruceDeUmbral(porcentajes, indice + 1, hasta, (p) => p >= media, 1);
  if (sube !== null) {
    return `La probabilidad sube a ${porcentajes[sube]}${NBSP}% ${desdeLas(
      horasUtc, sube, ahoraMs, timezone,
    )}.`;
  }
  if (nivel === 'nula') {
    return `Se mantiene seco ${duracionHoras(N)}.`;
  }
  return `Se mantiene por debajo de ${media}${NBSP}% ${duracionHoras(N)}.`;
}

export function textoChipRadar(radar: EstadoRadar, timezone: string): ChipRadar {
  if (radar.estado === 'cargando') {
    return { texto: 'Radar: consultando…', tono: 'neutro' };
  }
  if (radar.estado === 'ok') {
    const kmh = radar.avance === null ? 0 : Math.round(radar.avance.kmh);
    if (radar.avance && kmh >= 1) {
      return {
        texto: `Radar: avanza a ${kmh}${NBSP}km/h al ${nombreRumbo(radar.avance.haciaGrados)}`,
        tono: 'ok',
      };
    }
    return {
      texto: `Radar: imagen de las ${formatHoraLocal(new Date(radar.tFrameMs).toISOString(), timezone)} h`,
      tono: 'ok',
    };
  }
  if (radar.estado === 'sin-cobertura') {
    return { texto: 'Radar: sin cobertura aquí', tono: 'aviso' };
  }
  if (radar.estado === 'desactualizado') {
    return { texto: `Radar: imagen de hace ${Math.round(radar.edadMin)} min, no se usa`, tono: 'aviso' };
  }
  return { texto: 'Radar no disponible', tono: 'aviso' };
}

export function resumirCielo(e: EntradaCielo): ResumenCielo {
  const { horasUtc, pop, pesoRadar, indice, ahoraMs, timezone, radar } = e;
  const chipRadar = textoChipRadar(radar, timezone);
  // La hora en curso ya terminó (pestaña abierta mucho tiempo) o el índice no existe.
  const vencido =
    indice < 0 || indice >= horasUtc.length || Date.parse(horasUtc[indice]) <= ahoraMs;
  if (vencido) {
    const popActual = indice >= 0 && indice < pop.length ? pop[indice] : undefined;
    return {
      porcentaje: popActual === undefined ? 0 : porcentajeMostrado(popActual),
      nivel: popActual === undefined ? 'nula' : nivelDeLluvia(popActual),
      accion: '',
      frase: null,
      etiquetaHora: '',
      conRadar: false,
      chipRadar,
      vencido: true,
    };
  }
  const inicioIso = new Date(Date.parse(horasUtc[indice]) - MS_HORA).toISOString();
  const nivel = nivelDeLluvia(pop[indice]);
  return {
    porcentaje: porcentajeMostrado(pop[indice]),
    nivel,
    accion: MENSAJE_ACCION[nivel],
    frase: fraseDelCielo({ horasUtc, pop, indice, ahoraMs, timezone }),
    etiquetaHora: `Ahora · ${formatHoraLocal(inicioIso, timezone)} a ${formatHoraLocal(
      horasUtc[indice], timezone,
    )} h`,
    conRadar: pesoRadar[indice] > config.ui.pesoRadarVisible,
    chipRadar,
    vencido: false,
  };
}
