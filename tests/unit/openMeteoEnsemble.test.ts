import { http, HttpResponse } from 'msw';
import { describe, expect, test } from 'vitest';
import { config } from '../../src/config';
import type { GeoPoint } from '../../src/domain/types';
import {
  fetchEnsemble,
  fetchEnsemblePorModelo,
  parseEnsembleResponse,
} from '../../src/providers/openMeteoEnsemble';
import { ensambleFixture, horasUtcPrueba } from '../helpers/ensamble';
import { server } from '../setup';

const CDMX: GeoPoint = { lat: 19.43, lon: -99.13 };

describe('parseEnsembleResponse', () => {
  test('parsea los 5 modelos con control y miembros', () => {
    const fixture = ensambleFixture();
    const resultado = parseEnsembleResponse(fixture, [
      'ecmwf_ifs025',
      'ecmwf_aifs025',
      'ncep_gefs_seamless',
      'icon_global_eps',
      'gem_global_ensemble',
    ]);
    expect(resultado.porModelo).toHaveLength(5);
    expect(resultado.modelosFallidos).toEqual([]);
    expect(resultado.timezone).toBe('America/Mexico_City');
    const ecmwf = resultado.porModelo.find((m) => m.modelo === 'ecmwf_ifs025');
    expect(ecmwf?.miembros).toHaveLength(51);
    const gem = resultado.porModelo.find((m) => m.modelo === 'gem_global_ensemble');
    expect(gem?.miembros).toHaveLength(21);
    const total = resultado.porModelo.reduce((acc, m) => acc + m.miembros.length, 0);
    expect(total).toBe(194);
  });

  test('marca como fallido un modelo sin miembros', () => {
    const fixture = ensambleFixture({ modelos: ['ecmwf_ifs025'] });
    const resultado = parseEnsembleResponse(fixture, ['ecmwf_ifs025', 'gem_global_ensemble']);
    expect(resultado.porModelo).toHaveLength(1);
    expect(resultado.modelosFallidos).toEqual(['gem_global_ensemble']);
  });

  test('convierte epoch a cadenas UTC con Z', () => {
    const fixture = ensambleFixture({ numHoras: 2 });
    const resultado = parseEnsembleResponse(fixture, ['ecmwf_ifs025']);
    expect(resultado.horasUtc).toEqual(horasUtcPrueba(2).map((h) => `${h}Z`));
  });

  test('con "timezone":"GMT" devuelve null en lugar de una zona inválida', () => {
    const fixture = ensambleFixture({ modelos: ['ecmwf_ifs025'], numHoras: 2, timezone: 'GMT' });
    const resultado = parseEnsembleResponse(fixture, ['ecmwf_ifs025']);
    expect(resultado.timezone).toBeNull();
  });

  test('lanza error con payload inválido', () => {
    expect(() => parseEnsembleResponse(null, ['ecmwf_ifs025'])).toThrow();
    expect(() => parseEnsembleResponse({}, ['ecmwf_ifs025'])).toThrow();
    expect(() => parseEnsembleResponse({ hourly: { time: [] } }, ['ecmwf_ifs025'])).toThrow();
    expect(() =>
      parseEnsembleResponse(
        { hourly: { time: ['2026-09-24T00:00'], precipitation_otro: [1] } },
        ['ecmwf_ifs025'],
      ),
    ).toThrow('Respuesta de ensamble inválida');
  });

  test('convierte nulls de precipitación en 0', () => {
    const fixture = ensambleFixture({ modelos: ['ecmwf_ifs025'], numHoras: 2 });
    (fixture.hourly as Record<string, unknown>).precipitation_ecmwf_ifs025 = [null, null];
    const resultado = parseEnsembleResponse(fixture, ['ecmwf_ifs025']);
    expect(resultado.porModelo[0].miembros[0]).toEqual([0, 0]);
  });
});

describe('fetchEnsemble', () => {
  test('pide timezone=auto y timeformat=unixtime, y devuelve la zona del punto', async () => {
    const urls: string[] = [];
    server.use(
      http.get(`${config.urls.ensemble}`, ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json(
          ensambleFixture({ timezone: 'America/Tijuana', offsetS: -25200 }),
        );
      }),
    );

    const resultado = await fetchEnsemble(CDMX);

    expect(urls).toHaveLength(1);
    const params = new URL(urls[0]).searchParams;
    expect(params.get('timezone')).toBe('auto');
    expect(params.get('timeformat')).toBe('unixtime');
    expect(resultado.timezone).toBe('America/Tijuana');
  });
});

describe('fetchEnsemblePorModelo', () => {
  test('pide timezone=auto y timeformat=unixtime en cada llamada por modelo', async () => {
    const urls: string[] = [];
    server.use(
      http.get(`${config.urls.ensemble}`, ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json(ensambleFixture({ modelos: ['ecmwf_ifs025'] }));
      }),
    );

    const resultado = await fetchEnsemblePorModelo(CDMX);

    expect(urls).toHaveLength(5);
    for (const url of urls) {
      const params = new URL(url).searchParams;
      expect(params.get('timezone')).toBe('auto');
      expect(params.get('timeformat')).toBe('unixtime');
    }
    expect(resultado.timezone).toBe('America/Mexico_City');
  });

  test('toma la primera zona no nula entre las respuestas exitosas', async () => {
    server.use(
      http.get(`${config.urls.ensemble}`, ({ request }) => {
        const modelos = new URL(request.url).searchParams.get('models') ?? '';
        if (modelos.includes(',')) {
          return HttpResponse.json({ error: 'boom' }, { status: 500 });
        }
        if (modelos === 'ecmwf_ifs025') {
          return HttpResponse.json(ensambleFixture({ modelos: [modelos], timezone: 'GMT' }));
        }
        return HttpResponse.json(
          ensambleFixture({ modelos: [modelos], timezone: 'America/Tijuana', offsetS: -25200 }),
        );
      }),
    );

    const resultado = await fetchEnsemblePorModelo(CDMX);

    expect(resultado.timezone).toBe('America/Tijuana');
  });
});
