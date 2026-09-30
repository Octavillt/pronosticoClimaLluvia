import { config } from '../config';
import type { Nowcast, Observacion, ParVerificado, Prediccion } from '../domain/types';
import { leerObservaciones, leerPredicciones } from './almacenVerificacion';
import { construirCalibracion, type Calibracion } from './calibracion';
import { emparejar, resolverHoras } from './verificacion';

/** Una observación por cada frame de radar con cobertura en el punto (`nowcast.puntual`). */
export function observacionesDeRadar(nowcast: Nowcast, celda: string): Observacion[] {
  const frames = new Map(nowcast.puntual.map((p) => [p.tMs, p]));
  return [...frames.values()].map(({ tMs, dbz }) => ({
    id: `${celda}|radar|${tMs}`,
    celda,
    tMs,
    lluvia: dbz >= config.radar.umbralDbz,
    fuente: 'radar',
  }));
}

export function observacionDeUsuario(celda: string, lluvia: boolean, tMs: number): Observacion {
  return { id: `${celda}|usuario|${tMs}`, celda, tMs, lluvia, fuente: 'usuario' };
}

export interface Historial {
  predicciones: Prediccion[];
  observaciones: Observacion[];
}

export async function cargarHistorial(): Promise<Historial> {
  const [predicciones, observaciones] = await Promise.all([
    leerPredicciones(),
    leerObservaciones(),
  ]);
  return { predicciones, observaciones };
}

/** Junta las horas ya resueltas con las predicciones y ajusta la isotónica de cada horizonte. */
export function calibracionDesde(
  predicciones: Prediccion[],
  observaciones: Observacion[],
  ahoraMs: number,
): { calibracion: Calibracion; pares: ParVerificado[] } {
  const { resueltas } = resolverHoras(observaciones, ahoraMs);
  const pares = emparejar(predicciones, resueltas);
  return { calibracion: construirCalibracion(pares), pares };
}
