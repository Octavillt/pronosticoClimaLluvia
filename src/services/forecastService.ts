import { isInMexico } from '../domain/mexico';
import type {
  GeoPoint,
  RespuestaEnsamble,
  RespuestaPronostico,
  ResultadoPronostico,
} from '../domain/types';
import { fetchEnsemble, fetchEnsemblePorModelo } from '../providers/openMeteoEnsemble';
import { fetchForecast } from '../providers/openMeteoForecast';
import { computePopSeries } from './ensemblePop';
import { corridaModelo, geohashEncode } from './geohash';
import { guardarCache, leerCache } from './cache';

const MARGEN_CORRIDA_MS = 30 * 60 * 1000;

function ttlHastaSiguienteCorrida(ahora: Date = new Date()): number {
  const siguiente = new Date(ahora.getTime());
  siguiente.setUTCMinutes(0, 0, 0);
  siguiente.setUTCHours((Math.floor(ahora.getUTCHours() / 6) + 1) * 6);
  return siguiente.getTime() - ahora.getTime() + MARGEN_CORRIDA_MS;
}

async function obtenerEnsamble(punto: GeoPoint): Promise<RespuestaEnsamble> {
  try {
    return await fetchEnsemble(punto);
  } catch {
    return fetchEnsemblePorModelo(punto);
  }
}

function mediaEnsamble(ensamble: RespuestaEnsamble): (number | null)[] {
  return ensamble.horasUtc.map((_, h) => {
    let suma = 0;
    let cuenta = 0;
    for (const serie of ensamble.porModelo) {
      for (const miembro of serie.miembros) {
        const valor = miembro[h];
        if (valor !== undefined) {
          suma += valor;
          cuenta += 1;
        }
      }
    }
    return cuenta === 0 ? null : suma / cuenta;
  });
}

function alinearComplemento(
  horasUtc: string[],
  complemento: RespuestaPronostico | null,
  respaldoMm: (number | null)[],
): Pick<RespuestaPronostico, 'temperaturaC' | 'precipitacionMm' | 'codigoClima'> {
  if (!complemento) {
    return {
      temperaturaC: horasUtc.map(() => null),
      precipitacionMm: respaldoMm,
      codigoClima: horasUtc.map(() => null),
    };
  }
  const indice = new Map(complemento.horasUtc.map((hora, i) => [hora, i]));
  return {
    temperaturaC: horasUtc.map((hora) => {
      const i = indice.get(hora);
      return i === undefined ? null : complemento.temperaturaC[i];
    }),
    precipitacionMm: horasUtc.map((hora) => {
      const i = indice.get(hora);
      return i === undefined ? null : complemento.precipitacionMm[i];
    }),
    codigoClima: horasUtc.map((hora) => {
      const i = indice.get(hora);
      return i === undefined ? null : complemento.codigoClima[i];
    }),
  };
}

type DatosCacheables = Extract<ResultadoPronostico, { tipo: 'ok' }>;

export async function obtenerPronostico(punto: GeoPoint): Promise<ResultadoPronostico> {
  if (!isInMexico(punto)) {
    return { tipo: 'fuera-mexico', punto };
  }

  const clave = `pop:${geohashEncode(punto.lat, punto.lon)}:${corridaModelo()}`;
  const cacheado = await leerCache<DatosCacheables>(clave);
  if (cacheado) {
    return { ...cacheado, punto, fuentes: { ...cacheado.fuentes, cache: 'hit' } };
  }

  const [resultadoEnsamble, resultadoComplemento] = await Promise.allSettled([
    obtenerEnsamble(punto),
    fetchForecast(punto),
  ]);

  if (resultadoEnsamble.status === 'rejected') {
    throw new Error(
      `No se pudo obtener el ensamble: ${(resultadoEnsamble.reason as Error).message}`,
    );
  }

  const ensamble = resultadoEnsamble.value;
  const complemento =
    resultadoComplemento.status === 'fulfilled' ? resultadoComplemento.value : null;

  const { horasUtc } = ensamble;
  const pop = computePopSeries(ensamble.porModelo, horasUtc.length);
  const series = alinearComplemento(horasUtc, complemento, mediaEnsamble(ensamble));

  const datos: DatosCacheables = {
    tipo: 'ok',
    punto,
    timezone: complemento?.timezone ?? 'America/Mexico_City',
    horasUtc,
    pop,
    ...series,
    fuentes: {
      ensamble: ensamble.modelosFallidos.length > 0 ? 'degradado' : 'ok',
      modelosFallidos: ensamble.modelosFallidos,
      complemento: complemento ? 'ok' : 'error',
      cache: 'miss',
    },
  };
  await guardarCache(clave, datos, ttlHastaSiguienteCorrida());

  return datos;
}
