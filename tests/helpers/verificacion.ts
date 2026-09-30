import type { Observacion, Prediccion } from '../../src/domain/types';
import { geohashEncode } from '../../src/services/geohash';

export const PUNTO_VERIFICACION = { lat: 19.43, lon: -99.13 };

/** Se dijo 80 %; solo llovió en una de cada diez horas observadas. */
export function historialVerificacion(n = 150, ahoraMs = Date.now()) {
  const celda = geohashEncode(PUNTO_VERIFICACION.lat, PUNTO_VERIFICACION.lon);
  const base = Math.floor(ahoraMs / 3_600_000) * 3_600_000;
  const predicciones: Prediccion[] = [];
  const observaciones: Observacion[] = [];
  for (let i = 1; i <= n; i += 1) {
    const finMs = base - i * 3_600_000;
    predicciones.push({ id: `${celda}|${finMs}|1`, celda, finMs, emitidoMs: finMs - 1_800_000,
      horizonteH: 1, pop: 0.8, popEnsamble: 0.6, pesoRadar: 0.5 });
    for (let v = 1; v <= 3; v += 1) {
      const tMs = finMs - v * 600_000;
      observaciones.push({ id: `${celda}|radar|${tMs}`, celda, tMs, lluvia: i % 10 === 0 && v === 1, fuente: 'radar' });
    }
  }
  return { formato: 'sistemaclima-verificacion' as const, version: 1 as const, exportadoMs: ahoraMs, predicciones, observaciones };
}
