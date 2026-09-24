import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, test, vi } from 'vitest';
import App from '../../src/App';
import { config } from '../../src/config';
import { limpiarExpirados } from '../../src/services/cache';
import { ensambleFixture, forecastFixture } from '../helpers/ensamble';
import { server } from '../setup';

const CDMX = { lat: 19.43, lon: -99.13 };

function mockGeolocalizacion(
  comportamiento:
    | { tipo: 'ok'; punto?: { lat: number; lon: number } }
    | { tipo: 'denegado' }
    | { tipo: 'sin-soporte' },
) {
  if (comportamiento.tipo === 'sin-soporte') {
    Object.defineProperty(window.navigator, 'geolocation', {
      value: undefined,
      configurable: true,
    });
    return;
  }
  const getCurrentPosition = vi.fn(
    (exito: PositionCallback, error?: PositionErrorCallback | null) => {
      if (comportamiento.tipo === 'ok') {
        const punto = comportamiento.punto ?? CDMX;
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
        });
      } else {
        error?.({
          code: 1,
          message: 'denegado',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        });
      }
    },
  );
  Object.defineProperty(window.navigator, 'geolocation', {
    value: { getCurrentPosition },
    configurable: true,
  });
}

function mockProveedores() {
  server.use(
    http.get(`${config.urls.ensemble}`, () => HttpResponse.json(ensambleFixture())),
    http.get(`${config.urls.forecast}`, () => HttpResponse.json(forecastFixture())),
    http.get(`${config.urls.geocoding}`, () =>
      HttpResponse.json({
        results: [
          { name: 'Guadalajara', latitude: 20.67, longitude: -103.35, admin1: 'Jalisco' },
        ],
      }),
    ),
  );
}

describe('App', () => {
  afterEach(async () => {
    await limpiarExpirados(Number.MAX_SAFE_INTEGER);
  });

  test('con geolocalización concedida se ve la probabilidad', async () => {
    mockGeolocalizacion({ tipo: 'ok' });
    mockProveedores();
    render(<App />);
    expect(await screen.findByTestId('pop-ahora')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'SistemaClima' })).toBeTruthy();
    expect(screen.getByText(/Tu ubicación/)).toBeTruthy();
  });

  test('con permiso denegado aparece la búsqueda de ciudad', async () => {
    mockGeolocalizacion({ tipo: 'denegado' });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Busca tu ciudad' })).toBeTruthy();
  });

  test('fuera de México muestra el mensaje de cobertura', async () => {
    mockGeolocalizacion({ tipo: 'ok', punto: { lat: 40.42, lon: -3.7 } });
    render(<App />);
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toMatch(/fuera de México/);
  });

  test('al buscar una ciudad y elegirla se ve la probabilidad', async () => {
    mockGeolocalizacion({ tipo: 'denegado' });
    mockProveedores();
    render(<App />);

    const campo = await screen.findByLabelText('Nombre de la ciudad');
    fireEvent.change(campo, { target: { value: 'Guadalajara' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    fireEvent.click(await screen.findByRole('button', { name: /Guadalajara, Jalisco/ }));

    await waitFor(() => expect(screen.getByTestId('pop-ahora')).toBeTruthy());
    expect(screen.getByText(/Guadalajara/)).toBeTruthy();
  });

  test('si los proveedores fallan muestra error y permite reintentar', async () => {
    mockGeolocalizacion({ tipo: 'ok' });
    server.use(
      http.get(`${config.urls.ensemble}`, () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
      http.get(`${config.urls.forecast}`, () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );
    render(<App />);
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toMatch(/No se pudo obtener/);
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });
});
