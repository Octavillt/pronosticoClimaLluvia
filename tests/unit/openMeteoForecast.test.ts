import { http, HttpResponse } from 'msw';
import { describe, expect, test } from 'vitest';
import { config } from '../../src/config';
import type { GeoPoint } from '../../src/domain/types';
import { fetchForecast } from '../../src/providers/openMeteoForecast';
import { forecastFixture, horasUtcPrueba } from '../helpers/ensamble';
import { server } from '../setup';

const CDMX: GeoPoint = { lat: 19.43, lon: -99.13 };

describe('fetchForecast', () => {
  test('pide timezone=auto y timeformat=unixtime, y devuelve la zona del servidor', async () => {
    let urlCapturada = '';
    server.use(
      http.get(`${config.urls.forecast}`, ({ request }) => {
        urlCapturada = request.url;
        return HttpResponse.json(forecastFixture(3));
      }),
    );

    const resultado = await fetchForecast(CDMX);

    const params = new URL(urlCapturada).searchParams;
    expect(params.get('timezone')).toBe('auto');
    expect(params.get('timeformat')).toBe('unixtime');
    expect(resultado.timezone).toBe('America/Mexico_City');
  });

  test('convierte las horas epoch a cadenas UTC con Z', async () => {
    server.use(http.get(`${config.urls.forecast}`, () => HttpResponse.json(forecastFixture(3))));

    const resultado = await fetchForecast(CDMX);

    expect(resultado.horasUtc).toEqual(horasUtcPrueba(3).map((h) => `${h}Z`));
    expect(resultado.precipitacionMm).toHaveLength(3);
  });

  test('con "timezone":"GMT" devuelve null en lugar de inventar una zona', async () => {
    server.use(
      http.get(`${config.urls.forecast}`, () =>
        HttpResponse.json(forecastFixture(3, undefined, { timezone: 'GMT' })),
      ),
    );

    const resultado = await fetchForecast(CDMX);

    expect(resultado.timezone).toBeNull();
  });

  test('con horas ISO en lugar de epoch lanza error de respuesta inválida', async () => {
    const fixture = forecastFixture(3);
    (fixture.hourly as Record<string, unknown>).time = ['2026-09-24T00:00', '2026-09-24T01:00'];
    server.use(http.get(`${config.urls.forecast}`, () => HttpResponse.json(fixture)));

    await expect(fetchForecast(CDMX)).rejects.toThrow('Respuesta de pronóstico inválida');
  });
});
