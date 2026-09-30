import { config } from '../config';
import type { Movimiento, Nowcast, PasoNowcast } from '../domain/types';
import { estimarMovimiento, type CampoFechado, type OpcionesMovimiento } from './motion';
import { metrosPorPixel } from './tiles';

export interface ResultadoDisco {
  /** Fracción de píxeles observados con lluvia, suavizada para no llegar a 0 ni a 1. */
  pop: number;
  /** Fracción de los píxeles del disco que tienen cobertura, 0–1. */
  cobertura: number;
}

/**
 * Lluvia dentro de un disco: `pop = (píxeles ≥ umbral + 0.5) / (píxeles cubiertos + 1)`.
 * Los píxeles fuera del mosaico o sin cobertura no se cuentan como "seco": bajan `cobertura`.
 */
export function evaluarDisco(
  dbz: Float32Array,
  cobertura: Uint8Array,
  lado: number,
  cx: number,
  cy: number,
  radioPx: number,
  umbralDbz: number = config.radar.umbralDbz,
): ResultadoDisco {
  const radio = Math.max(1, radioPx);
  const r2 = radio * radio;
  let total = 0;
  let cubiertos = 0;
  let lluvia = 0;
  for (let y = Math.floor(cy - radio); y <= Math.ceil(cy + radio); y += 1) {
    for (let x = Math.floor(cx - radio); x <= Math.ceil(cx + radio); x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > r2) {
        continue;
      }
      total += 1;
      if (x < 0 || y < 0 || x >= lado || y >= lado) {
        continue;
      }
      const i = y * lado + x;
      if (cobertura[i] === 0) {
        continue;
      }
      cubiertos += 1;
      if (dbz[i] >= umbralDbz) {
        lluvia += 1;
      }
    }
  }
  if (cubiertos === 0 || total === 0) {
    return { pop: 0, cobertura: 0 };
  }
  return { pop: (lluvia + 0.5) / (cubiertos + 1), cobertura: cubiertos / total };
}

export interface OpcionesNowcast {
  umbralDbz: number;
  pasoMin: number;
  horizonteMin: number;
  radioBaseKm: number;
  crecimientoRadioKmPorMin: number;
  movimiento: OpcionesMovimiento;
}

export interface EntradaNowcast {
  /** Frames del más viejo al más reciente. */
  campos: CampoFechado[];
  cobertura: Uint8Array;
  lado: number;
  /** Posición del punto dentro del mosaico, en píxeles. */
  puntoX: number;
  puntoY: number;
  lat: number;
  zoom: number;
}

function avanceDe(movimiento: Movimiento, lat: number, zoom: number): Nowcast['avance'] {
  if (movimiento.estado !== 'estimado') {
    return null;
  }
  const { vxPxMin, vyPxMin } = movimiento;
  const kmh = (Math.hypot(vxPxMin, vyPxMin) * metrosPorPixel(lat, zoom) * 60) / 1000;
  // En pantalla y crece hacia el sur, así que el norte es −y.
  const haciaGrados = ((Math.atan2(vxPxMin, -vyPxMin) * 180) / Math.PI + 360) % 360;
  return { kmh, haciaGrados };
}

/**
 * Nowcast puntual: por cada paso de 10 min hasta el horizonte se mira, en el frame más reciente,
 * un disco "aguas arriba" (el punto desplazado contra el viento del movimiento) cuyo radio crece
 * con el horizonte para reflejar la incertidumbre de la advección.
 */
export function calcularNowcast(
  entrada: EntradaNowcast,
  opciones: OpcionesNowcast = config.radar,
): Nowcast {
  const { campos, cobertura, lado, puntoX, puntoY, lat, zoom } = entrada;
  if (campos.length === 0) {
    throw new Error('Se necesita al menos un frame de radar');
  }
  const ultimo = campos[campos.length - 1];
  const metrosPx = metrosPorPixel(lat, zoom);
  const radioPx = (minutos: number): number =>
    ((opciones.radioBaseKm + opciones.crecimientoRadioKmPorMin * minutos) * 1000) / metrosPx;

  const movimiento = estimarMovimiento(campos, lado, puntoX, puntoY, opciones.movimiento);
  const vx = movimiento.estado === 'estimado' ? movimiento.vxPxMin : 0;
  const vy = movimiento.estado === 'estimado' ? movimiento.vyPxMin : 0;

  const observados: PasoNowcast[] = campos.slice(0, -1).map((campo) => ({
    tMs: campo.tMs,
    ...evaluarDisco(campo.dbz, cobertura, lado, puntoX, puntoY, radioPx(0), opciones.umbralDbz),
  }));

  const pronostico: PasoNowcast[] = [];
  for (let minutos = 0; minutos <= opciones.horizonteMin; minutos += opciones.pasoMin) {
    pronostico.push({
      tMs: ultimo.tMs + minutos * 60_000,
      ...evaluarDisco(
        ultimo.dbz,
        cobertura,
        lado,
        puntoX - vx * minutos,
        puntoY - vy * minutos,
        radioPx(minutos),
        opciones.umbralDbz,
      ),
    });
  }

  return { tFrameMs: ultimo.tMs, movimiento, observados, pronostico, avance: avanceDe(movimiento, lat, zoom) };
}
