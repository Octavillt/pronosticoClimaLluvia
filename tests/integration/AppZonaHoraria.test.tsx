import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import App from '../../src/App';
import { config } from '../../src/config';
import { isInMexico } from '../../src/domain/mexico';
import { limpiarExpirados } from '../../src/services/cache';
import { ensambleFixture, forecastFixture } from '../helpers/ensamble';
import { indiceRadarFixture } from '../helpers/radar';
import { server } from '../setup';

/** 02:36Z del 1-oct: 20:36 del 30-sep en Ciudad de México y 19:36 en Tijuana. */
const AHORA = new Date('2026-10-01T02:36:00Z');
const CDMX = { lat: 19.43, lon: -99.13 };
const TIJUANA = { lat: 32.5, lon: -117.0 };

function mockGeolocalizacion(punto: { lat: number; lon: number }) {
  Object.defineProperty(window.navigator, 'geolocation', {
    value: {
      getCurrentPosition: (exito: PositionCallback) =>
        exito({
          coords: {
            latitude: punto.lat,
            longitude: punto.lon,
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            toJSON: () => ({}),
          },
          timestamp: Date.now(),
          toJSON: () => ({}),
        } as GeolocationPosition),
    },
    configurable: true,
  });
}

/** Series como la API real: arrancan a la medianoche local del punto, expresada en UTC. */
function mockProveedores(serie: { inicio: string; timezone: string; offsetS: number }) {
  server.use(
    http.get(`${config.urls.ensemble}`, () =>
      HttpResponse.json(
        ensambleFixture({ inicio: serie.inicio, timezone: serie.timezone, offsetS: serie.offsetS }),
      ),
    ),
    http.get(`${config.urls.forecast}`, () =>
      HttpResponse.json(
        forecastFixture(72, serie.inicio, { timezone: serie.timezone, offsetS: serie.offsetS }),
      ),
    ),
    // Sin frames de radar: el nowcast termina sin pedir tiles.
    http.get(`${config.urls.rainviewer}`, () => HttpResponse.json(indiceRadarFixture({ numFrames: 0 }))),
  );
}

const SERIE_CDMX = { inicio: '2026-09-30T06:00', timezone: 'America/Mexico_City', offsetS: -21600 };
const SERIE_TIJUANA = { inicio: '2026-09-30T07:00', timezone: 'America/Tijuana', offsetS: -25200 };

describe('App con la zona horaria del punto', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AHORA);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await limpiarExpirados(Number.MAX_SAFE_INTEGER);
  });

  test('en CDMX muestra la hora local, no la UTC', async () => {
    mockGeolocalizacion(CDMX);
    mockProveedores(SERIE_CDMX);
    render(<App />);

    const bloque = await screen.findByLabelText('Probabilidad de lluvia actual');
    expect(bloque.textContent).toMatch(/20:00.*21:00 h/);
    expect(bloque.textContent).not.toMatch(/02:00/);
    expect(bloque.textContent).not.toMatch(/03:00/);
  });

  test('en Tijuana muestra la hora local de su zona', async () => {
    expect(isInMexico(TIJUANA)).toBe(true);
    mockGeolocalizacion(TIJUANA);
    mockProveedores(SERIE_TIJUANA);
    render(<App />);

    const bloque = await screen.findByLabelText('Probabilidad de lluvia actual');
    expect(bloque.textContent).toMatch(/19:00.*20:00 h/);
    expect(bloque.textContent).not.toMatch(/02:00/);
    expect(bloque.textContent).not.toMatch(/03:00/);
  });

  test('las barras de horas llevan la hora local de la hora en curso', async () => {
    mockGeolocalizacion(CDMX);
    mockProveedores(SERIE_CDMX);
    render(<App />);

    await waitFor(() =>
      expect(screen.getByTestId('barra-pop-0').textContent).toMatch(/20:00 a 21:00 h/),
    );
  });
});
