import { normalizarZona } from '../utils/localTime';

export const PARAMETROS_TIEMPO = { timezone: 'auto', timeformat: 'unixtime' } as const;

export function horasUtcDesdeEpoch(valor: unknown): string[] {
  if (!Array.isArray(valor) || valor.length === 0) {
    throw new Error('Se esperaba un arreglo no vacío de horas (segundos epoch)');
  }
  return valor.map((t, i) => {
    const fecha = typeof t === 'number' && Number.isFinite(t) ? new Date(t * 1000) : null;
    if (!fecha || Number.isNaN(fecha.getTime())) {
      throw new Error(`Hora epoch inválida en la posición ${i}`);
    }
    return `${fecha.toISOString().slice(0, 16)}Z`;
  });
}

export function zonaDeRespuesta(raiz: Record<string, unknown>): string | null {
  return normalizarZona(raiz.timezone);
}
