import { config } from '../config';
import type { CiudadEncontrada } from '../domain/types';
import { fetchJson } from './http';

interface ResultadoGeocoding {
  name?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  admin1?: unknown;
}

export function parseGeocodingResponse(json: unknown): CiudadEncontrada[] {
  if (typeof json !== 'object' || json === null) {
    throw new Error('Respuesta de geocoding inválida: no es un objeto');
  }
  const resultados = (json as Record<string, unknown>).results;
  if (!Array.isArray(resultados)) {
    return [];
  }
  return (resultados as ResultadoGeocoding[])
    .filter(
      (r) =>
        typeof r.name === 'string' &&
        typeof r.latitude === 'number' &&
        typeof r.longitude === 'number',
    )
    .map((r) => ({
      nombre: r.name as string,
      estado: typeof r.admin1 === 'string' ? r.admin1 : '',
      lat: r.latitude as number,
      lon: r.longitude as number,
    }));
}

export async function buscarCiudad(nombre: string): Promise<CiudadEncontrada[]> {
  const params = new URLSearchParams({
    name: nombre,
    count: '5',
    language: 'es',
    countryCode: 'MX',
  });
  const json = await fetchJson(`${config.urls.geocoding}?${params.toString()}`);
  return parseGeocodingResponse(json);
}
