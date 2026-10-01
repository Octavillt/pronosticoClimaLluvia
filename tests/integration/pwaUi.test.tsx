import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, test, vi } from 'vitest';
import App from '../../src/App';
import type { ControladorPwa } from '../../src/pwa/registro';
import { useEnLinea } from '../../src/pwa/useEnLinea';
import { AvisoActualizacion } from '../../src/ui/AvisoActualizacion';
import { AvisoSinConexion } from '../../src/ui/AvisoSinConexion';
import { config } from '../../src/config';
import { limpiarExpirados } from '../../src/services/cache';
import { ensambleFixture, forecastFixture } from '../helpers/ensamble';
import { indiceRadarFixture } from '../helpers/radar';
import { server } from '../setup';

const CDMX = { lat: 19.43, lon: -99.13 };

function mockGeolocalizacion() {
  Object.defineProperty(window.navigator, 'geolocation', {
    value: {
      getCurrentPosition: (exito: PositionCallback) =>
        exito({
          coords: {
            latitude: CDMX.lat,
            longitude: CDMX.lon,
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            toJSON: () => ({}),
          },
          timestamp: Date.now(),
          toJSON: () => ({}),
        }),
    },
    configurable: true,
  });
}

function mockProveedores() {
  server.use(
    http.get(`${config.urls.ensemble}`, () => HttpResponse.json(ensambleFixture())),
    http.get(`${config.urls.forecast}`, () => HttpResponse.json(forecastFixture())),
    http.get(`${config.urls.rainviewer}`, () => HttpResponse.json(indiceRadarFixture({ numFrames: 0 }))),
    http.get(`${config.urls.geocoding}`, () => HttpResponse.json({ results: [] })),
  );
}

function fijarEnLinea(valor: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value: valor, configurable: true });
}

function SondaEnLinea() {
  return <AvisoSinConexion enLinea={useEnLinea()} />;
}

function controladorFalso(hay: boolean): ControladorPwa {
  return {
    hayActualizacion: () => hay,
    suscribirse: (oyente) => {
      oyente(hay);
      return () => {};
    },
    activar: vi.fn(),
  };
}

describe('aviso de actualización PWA', () => {
  test('no se renderiza sin actualización y sí con ella, con rol status y botón', () => {
    const { rerender } = render(
      <AvisoActualizacion visible={false} onActualizar={() => {}} />,
    );
    expect(screen.queryByRole('status')).toBeNull();

    const onActualizar = vi.fn();
    rerender(<AvisoActualizacion visible onActualizar={onActualizar} />);
    expect(screen.getByRole('status').textContent).toMatch(/versión nueva de SistemaClima/);
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(onActualizar).toHaveBeenCalledOnce();
  });
});

describe('aviso de sin conexión', () => {
  afterEach(() => fijarEnLinea(true));

  test('aparece con navigator.onLine false y reacciona a online/offline', () => {
    fijarEnLinea(false);
    render(<SondaEnLinea />);
    expect(screen.getByRole('status').textContent).toMatch(/Sin conexión/);

    fireEvent(window, new Event('online'));
    expect(screen.queryByRole('status')).toBeNull();

    fireEvent(window, new Event('offline'));
    expect(screen.getByRole('status').textContent).toMatch(/pronóstico no esté actualizado/);
  });
});

describe('App con avisos PWA', () => {
  afterEach(async () => {
    await limpiarExpirados(Number.MAX_SAFE_INTEGER);
    fijarEnLinea(true);
  });

  test('los avisos conviven con el pronóstico sin romperlo', async () => {
    fijarEnLinea(false);
    mockGeolocalizacion();
    mockProveedores();
    render(<App controladorPwa={controladorFalso(true)} />);

    const avisos = await screen.findAllByRole('status');
    expect(avisos.some((aviso) => aviso.textContent?.match(/Sin conexión/))).toBe(true);
    expect(screen.getByText(/versión nueva de SistemaClima/)).toBeTruthy();

    expect(await screen.findByTestId('pop-ahora')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'SistemaClima' })).toBeTruthy();
  });

  test('sin controlador ni offline no hay avisos y el pronóstico carga igual', async () => {
    mockGeolocalizacion();
    mockProveedores();
    render(<App />);

    expect(await screen.findByTestId('pop-ahora')).toBeTruthy();
    expect(screen.queryByText(/versión nueva/)).toBeNull();
    expect(screen.queryByText(/Sin conexión/)).toBeNull();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'SistemaClima' })).toBeTruthy());
  });
});
