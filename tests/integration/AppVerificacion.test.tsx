import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import App from '../../src/App';
import { config } from '../../src/config';
import type { Observacion, Prediccion } from '../../src/domain/types';
import {
  borrarHistorial,
  guardarObservaciones,
  guardarPredicciones,
  leerPredicciones,
} from '../../src/services/almacenVerificacion';
import { limpiarExpirados } from '../../src/services/cache';
import { geohashEncode } from '../../src/services/geohash';
import { MS_HORA } from '../../src/utils/horas';
import { ensambleFixture, forecastFixture } from '../helpers/ensamble';
import { indiceRadarFixture } from '../helpers/radar';
import { server } from '../setup';

const CDMX = { lat: 19.43, lon: -99.13 };

function mockGeolocalizacion() {
  const getCurrentPosition = vi.fn((exito: PositionCallback) => {
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
    });
  });
  Object.defineProperty(window.navigator, 'geolocation', {
    value: { getCurrentPosition },
    configurable: true,
  });
}

/**
 * Las etiquetas horarias del ensamble no llevan zona y se parsean como hora local: el inicio de
 * la serie se construye con la hora LOCAL de "la hora que viene" para que la hora en curso caiga
 * siempre en la banda 0–1 h, corra la prueba cuando corra.
 */
function inicioProximaHoraLocal(): string {
  const d = new Date(Date.now() + MS_HORA);
  d.setMinutes(0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** ~80 % de los miembros con lluvia en todas las horas: PoP del ensamble ≈ 0.79. */
const casiTodosLlueven = (miembro: number) => (miembro % 5 === 0 ? 0 : 1);

function mockProveedores() {
  const inicio = inicioProximaHoraLocal();
  server.use(
    http.get(config.urls.ensemble, () =>
      HttpResponse.json(ensambleFixture({ inicio, precipitacion: casiTodosLlueven })),
    ),
    http.get(config.urls.forecast, () => HttpResponse.json(forecastFixture(72, inicio))),
    // Sin frames de radar: el nowcast termina sin datos y la mezcla es puro ensamble.
    http.get(config.urls.rainviewer, () => HttpResponse.json(indiceRadarFixture({ numFrames: 0 }))),
  );
}

/** 150 horas pasadas ya verificadas en la banda 0–1 h: se dijo 80 % y solo llovió 8 veces. */
async function sembrarHistorialSesgado(celda: string) {
  const horaBase = Math.floor(Date.now() / MS_HORA) * MS_HORA;
  const predicciones: Prediccion[] = [];
  const observaciones: Observacion[] = [];
  for (let i = 1; i <= 150; i += 1) {
    const finMs = horaBase - i * MS_HORA;
    predicciones.push({
      id: `${celda}|${finMs}|1`,
      celda,
      finMs,
      emitidoMs: finMs - MS_HORA / 2,
      horizonteH: 1,
      pop: 0.8,
      popEnsamble: 0.8,
      pesoRadar: 0,
    });
    for (let v = 0; v < 3; v += 1) {
      const tMs = finMs - (v + 1) * 10 * 60_000;
      observaciones.push({
        id: `${celda}|radar|${tMs}`,
        celda,
        tMs,
        lluvia: i <= 8 && v === 0,
        fuente: 'radar',
      });
    }
  }
  await guardarPredicciones(predicciones);
  await guardarObservaciones(observaciones);
}

describe('App + verificación', () => {
  beforeEach(async () => {
    await borrarHistorial();
    await limpiarExpirados(Number.MAX_SAFE_INTEGER);
  });
  afterEach(() => vi.restoreAllMocks());

  test('tras mostrarse un pronóstico se guardan las predicciones sin calibrar', async () => {
    mockGeolocalizacion();
    mockProveedores();
    render(<App />);
    await screen.findByTestId('pop-ahora');

    const celda = geohashEncode(CDMX.lat, CDMX.lon);
    await waitFor(async () => {
      expect((await leerPredicciones()).length).toBeGreaterThan(0);
    });
    const predicciones = await leerPredicciones();
    expect(predicciones.every((p) => p.celda === celda)).toBe(true);
    expect(
      predicciones.every((p) =>
        (config.verificacion.horizontesH as readonly number[]).includes(p.horizonteH),
      ),
    ).toBe(true);
    // Sin radar la mezcla es el ensamble (~0.79); se guarda tal cual, no la calibrada.
    expect(predicciones.every((p) => p.pop > 0.7)).toBe(true);
    expect(predicciones.every((p) => p.popEnsamble === p.pop)).toBe(true);
    // La hora en curso queda registrada en la banda 0–1 h.
    expect(predicciones.some((p) => p.horizonteH === 1 && p.finMs > Date.now())).toBe(true);
  });

  test('pronóstico → botón de lluvia → el panel cuenta la observación', async () => {
    mockGeolocalizacion();
    mockProveedores();
    render(<App />);
    await screen.findByTestId('pop-ahora');
    const boton = screen.getByRole('button', { name: 'Sí, está lloviendo' }) as HTMLButtonElement;
    await waitFor(() => expect(boton.disabled).toBe(false));
    expect(screen.getByTestId('exactitud-observaciones').textContent).toBe('0');
    fireEvent.click(boton);
    await screen.findByText('Gracias, registrado.');
    expect(screen.getByTestId('exactitud-observaciones').textContent).toBe('1');
  });

  test('con historial sesgado la PoP mostrada baja y lo guardado sigue siendo la no calibrada', async () => {
    const celda = geohashEncode(CDMX.lat, CDMX.lon);
    await sembrarHistorialSesgado(celda);
    const antesDeRender = Date.now();
    mockGeolocalizacion();
    mockProveedores();
    render(<App />);

    const popAhora = await screen.findByTestId('pop-ahora');
    // Se dijo ~79 % y el historial dice que con 80 % llovía el ~5 % de las veces.
    await waitFor(() => {
      expect(Number(popAhora.textContent?.replace('%', ''))).toBeLessThan(20);
    });
    expect(
      screen.getByText(/Calibrada con tu historial local \(150 horas verificadas\)/),
    ).toBeTruthy();

    // Lo que se registró durante esta sesión es la PoP sin calibrar.
    const predicciones = await leerPredicciones();
    const nuevas = predicciones.filter((p) => p.emitidoMs >= antesDeRender);
    expect(nuevas.length).toBeGreaterThan(0);
    expect(nuevas.every((p) => p.pop > 0.7)).toBe(true);
  });

  test('si IndexedDB falla el pronóstico se ve igual, sin calibración ni registro', async () => {
    const celda = geohashEncode(CDMX.lat, CDMX.lon);
    await sembrarHistorialSesgado(celda);
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new DOMException('IndexedDB no disponible', 'SecurityError');
    });
    mockGeolocalizacion();
    mockProveedores();
    render(<App />);

    const popAhora = await screen.findByTestId('pop-ahora');
    // El historial existe pero no se pudo leer: se muestra la PoP original (~79 %).
    expect(Number(popAhora.textContent?.replace('%', ''))).toBeGreaterThan(70);
    await waitFor(() => {
      expect(screen.queryByTestId('aviso-calibracion')).toBeNull();
    });
  });
});
