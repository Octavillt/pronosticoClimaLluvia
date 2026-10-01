import { config } from '../config';
import type { GeoPoint, RespuestaPronostico } from '../domain/types';
import { fetchJson } from './http';
import { horasUtcDesdeEpoch, PARAMETROS_TIEMPO, zonaDeRespuesta } from './tiempoOpenMeteo';

function aNumeros(valor: unknown): (number | null)[] {
  if (!Array.isArray(valor)) {
    throw new Error('Respuesta de pronóstico inválida: falta una serie horaria');
  }
  return valor.map((v) => (typeof v === 'number' ? v : null));
}

export function parseForecastResponse(json: unknown): RespuestaPronostico {
  if (typeof json !== 'object' || json === null) {
    throw new Error('Respuesta de pronóstico inválida: no es un objeto');
  }
  const raiz = json as Record<string, unknown>;
  const hourly = raiz.hourly;
  if (typeof hourly !== 'object' || hourly === null) {
    throw new Error('Respuesta de pronóstico inválida: falta "hourly"');
  }
  const registro = hourly as Record<string, unknown>;
  let horasUtc: string[];
  try {
    horasUtc = horasUtcDesdeEpoch(registro.time);
  } catch (e) {
    throw new Error(
      `Respuesta de pronóstico inválida: falta "hourly.time" (${(e as Error).message})`,
    );
  }
  return {
    timezone: zonaDeRespuesta(raiz),
    horasUtc,
    temperaturaC: aNumeros(registro.temperature_2m),
    precipitacionMm: aNumeros(registro.precipitation),
    codigoClima: aNumeros(registro.weather_code),
  };
}

export async function fetchForecast(punto: GeoPoint): Promise<RespuestaPronostico> {
  const params = new URLSearchParams({
    latitude: punto.lat.toFixed(4),
    longitude: punto.lon.toFixed(4),
    hourly: 'temperature_2m,precipitation,weather_code',
    forecast_days: '3',
    ...PARAMETROS_TIEMPO,
  });
  const json = await fetchJson(`${config.urls.forecast}?${params.toString()}`);
  return parseForecastResponse(json);
}
