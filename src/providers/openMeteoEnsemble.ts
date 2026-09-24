import { config } from '../config';
import type { GeoPoint, RespuestaEnsamble, SerieMiembros } from '../domain/types';
import { fetchJson } from './http';

export const MODELOS_ENSAMBLE = [
  'ecmwf_ifs025',
  'ecmwf_aifs025',
  'ncep_gefs_seamless',
  'icon_global_eps',
  'gem_global_ensemble',
] as const;

export type ModeloEnsamble = (typeof MODELOS_ENSAMBLE)[number];

const DIAS_PRONOSTICO = 3;

function urlEnsamble(punto: GeoPoint, modelos: readonly string[]): string {
  const params = new URLSearchParams({
    latitude: punto.lat.toFixed(4),
    longitude: punto.lon.toFixed(4),
    hourly: 'precipitation',
    forecast_days: String(DIAS_PRONOSTICO),
    timezone: 'UTC',
    models: modelos.join(','),
  });
  return `${config.urls.ensemble}?${params.toString()}`;
}

function esArregloNumeros(valor: unknown): valor is (number | null)[] {
  return Array.isArray(valor) && valor.every((v) => v === null || typeof v === 'number');
}

export function parseEnsembleResponse(json: unknown, modelos: readonly string[]): RespuestaEnsamble {
  if (typeof json !== 'object' || json === null) {
    throw new Error('Respuesta de ensamble inválida: no es un objeto');
  }
  const hourly = (json as Record<string, unknown>).hourly;
  if (typeof hourly !== 'object' || hourly === null) {
    throw new Error('Respuesta de ensamble inválida: falta "hourly"');
  }
  const registro = hourly as Record<string, unknown>;
  const tiempos = registro.time;
  if (!Array.isArray(tiempos) || tiempos.length === 0 || !tiempos.every((t) => typeof t === 'string')) {
    throw new Error('Respuesta de ensamble inválida: falta "hourly.time"');
  }
  const horasUtc = (tiempos as string[]).map((t) => `${t}Z`);

  const porModelo: SerieMiembros[] = [];
  const modelosFallidos: string[] = [];

  for (const modelo of modelos) {
    const control = registro[`precipitation_${modelo}`];
    const miembros: number[][] = [];
    if (esArregloNumeros(control)) {
      miembros.push(control.map((v) => v ?? 0));
    }
    for (let n = 1; n <= 99; n += 1) {
      const clave = `precipitation_member${String(n).padStart(2, '0')}_${modelo}`;
      const serie = registro[clave];
      if (serie === undefined) {
        break;
      }
      if (!esArregloNumeros(serie)) {
        throw new Error(`Respuesta de ensamble inválida: "${clave}" no es una serie horaria`);
      }
      miembros.push(serie.map((v) => v ?? 0));
    }
    if (miembros.length === 0) {
      modelosFallidos.push(modelo);
    } else {
      porModelo.push({ modelo, miembros });
    }
  }

  if (porModelo.length === 0) {
    throw new Error('Respuesta de ensamble sin ningún modelo con miembros');
  }

  return { horasUtc, porModelo, modelosFallidos };
}

export async function fetchEnsemble(punto: GeoPoint): Promise<RespuestaEnsamble> {
  const json = await fetchJson(urlEnsamble(punto, MODELOS_ENSAMBLE));
  return parseEnsembleResponse(json, MODELOS_ENSAMBLE);
}

export async function fetchEnsemblePorModelo(punto: GeoPoint): Promise<RespuestaEnsamble> {
  const resultados = await Promise.allSettled(
    MODELOS_ENSAMBLE.map(async (modelo) => {
      const json = await fetchJson(urlEnsamble(punto, [modelo]));
      return parseEnsembleResponse(json, [modelo]);
    }),
  );

  const exitosas = resultados.filter(
    (r): r is PromiseFulfilledResult<RespuestaEnsamble> => r.status === 'fulfilled',
  );
  if (exitosas.length === 0) {
    throw new Error('Fallaron todos los modelos del ensamble');
  }

  const horasUtc = exitosas[0].value.horasUtc;
  const porModelo = exitosas.flatMap((r) => r.value.porModelo);
  const modelosFallidos = MODELOS_ENSAMBLE.filter(
    (modelo) => !porModelo.some((serie) => serie.modelo === modelo),
  );
  return { horasUtc, porModelo, modelosFallidos };
}
