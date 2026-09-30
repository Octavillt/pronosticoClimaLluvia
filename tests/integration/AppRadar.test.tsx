import { render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import App from '../../src/App';
import { config } from '../../src/config';
import { pixelGlobal } from '../../src/nowcast/tiles';
import { limpiarExpirados } from '../../src/services/cache';
import { ensambleFixture, forecastFixture } from '../helpers/ensamble';
import {
  cargadorSintetico,
  indiceRadarFixture,
  tormentaQueAvanza,
  ZOOM,
  type EscenaRadar,
} from '../helpers/radar';
import { server } from '../setup';

const escena = vi.hoisted(() => ({ cargador: null as null | ((url: string) => Promise<unknown>) }));

vi.mock('../../src/providers/rainviewer', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../src/providers/rainviewer')>()),
  cargarTile: (url: string) => escena.cargador!(url),
}));
vi.mock('../../src/ui/MapaRadar', () => ({
  default: ({ indice }: { indice: { frames: unknown[] } }) => (
    <div data-testid="mapa-radar">{indice.frames.length} fotogramas</div>
  ),
}));

/** 21:36 en CDMX: la hora en curso es la de las 21:00 a las 22:00 y lleva la etiqueta 04:00Z. */
const AHORA = new Date('2026-09-30T03:36:00Z');
const CDMX = { lat: 19.43, lon: -99.13 };
const P = pixelGlobal(CDMX, ZOOM);

function mockGeolocalizacion() {
  Object.defineProperty(window.navigator, 'geolocation', {
    value: {
      getCurrentPosition: (exito: PositionCallback) =>
        exito({
          coords: { latitude: CDMX.lat, longitude: CDMX.lon, accuracy: 10 },
          timestamp: Date.now(),
        } as GeolocationPosition),
    },
    configurable: true,
  });
}

function mockProveedores(radar: { indice?: () => Response; escena?: EscenaRadar } = {}) {
  server.use(
    http.get(`${config.urls.ensemble}`, () => HttpResponse.json(ensambleFixture({ inicio: '2026-09-30T00:00' }))),
    http.get(`${config.urls.forecast}`, () => HttpResponse.json(forecastFixture(72, '2026-09-30T00:00'))),
    http.get(`${config.urls.rainviewer}`, () =>
      radar.indice ? radar.indice() : HttpResponse.json(indiceRadarFixture({ ahoraMs: AHORA.getTime() })),
    ),
  );
  if (radar.escena) {
    escena.cargador = cargadorSintetico(radar.escena);
  }
}

/** Tormenta de 40 px de radio justo sobre CDMX a las 03:26, que avanza hacia el este. */
const TORMENTA_SOBRE_EL_PUNTO: EscenaRadar = {
  dbz: tormentaQueAvanza({ gx0: P.x, gy0: P.y, t0Ms: AHORA.getTime() - 10 * 60_000, vxPxMin: 0.4, vyPxMin: 0, radioPx: 40 }),
  cubierto: () => true,
};

describe('App con radar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AHORA);
    mockGeolocalizacion();
  });

  afterEach(async () => {
    vi.useRealTimers();
    escena.cargador = null;
    await limpiarExpirados(Number.MAX_SAFE_INTEGER);
  });

  test('con lluvia observada sobre el punto, el radar sube la probabilidad y se ve el mapa', async () => {
    mockProveedores({ escena: TORMENTA_SOBRE_EL_PUNTO });
    render(<App />);

    await waitFor(() => expect(screen.getByTestId('origen-pop').textContent).toMatch(/radar/i));
    // El ensamble no ve lluvia (≈1 % por el suavizado); el radar la ve encima del punto.
    expect(Number.parseInt(screen.getByTestId('pop-ahora').textContent ?? '', 10)).toBeGreaterThan(70);
    // El mapa se carga de forma perezosa.
    expect((await screen.findByTestId('mapa-radar')).textContent).toBe('13 fotogramas');
    expect(screen.getByText(/Radar RainViewer: ✓/).textContent).toMatch(/imagen de las 21:26 h/);
    expect(screen.getByText(/Radar RainViewer: ✓/).textContent).toMatch(/avanza a \d+ km\/h hacia el este/);
  });

  test('la hora en curso muestra su intervalo (21:00 a 22:00), no el de la hora anterior', async () => {
    mockProveedores({ escena: TORMENTA_SOBRE_EL_PUNTO });
    render(<App />);
    const bloque = await screen.findByLabelText('Probabilidad de lluvia actual');
    await waitFor(() => expect(bloque.textContent).toMatch(/21:00.*22:00 h/));
  });

  test('la línea de horas arranca en la hora en curso y marca las barras con radar', async () => {
    mockProveedores({ escena: TORMENTA_SOBRE_EL_PUNTO });
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('barra-pop-0').getAttribute('data-radar')).toBe('si'));

    expect(screen.getByTestId('barra-pop-0').textContent).toMatch(/21:00 a 22:00 h/);
    // Con el paso de las horas el radar pierde peso hasta dejar de aparecer.
    expect(screen.getByTestId('barra-pop-12').getAttribute('data-radar')).toBe('no');
  });

  test('sin cobertura de radar se queda con el ensamble y no muestra el mapa', async () => {
    mockProveedores({ escena: { ...TORMENTA_SOBRE_EL_PUNTO, cubierto: () => false } });
    render(<App />);

    expect(await screen.findByText(/sin cobertura en esta zona/)).toBeTruthy();
    // Solo el ensamble, que sin lluvia en ningún miembro queda en ≈1 % por el suavizado.
    expect(screen.getByTestId('pop-ahora').textContent).toBe('1%');
    expect(screen.getByTestId('origen-pop').textContent).toMatch(/ensamble/);
    expect(screen.queryByTestId('mapa-radar')).toBeNull();
  });

  test('si RainViewer falla, el ensamble sigue mostrándose y la fuente aparece como no disponible', async () => {
    mockProveedores({ indice: () => HttpResponse.json({}, { status: 503 }) });
    render(<App />);

    expect(await screen.findByText(/Radar RainViewer: no disponible/)).toBeTruthy();
    expect(screen.getByTestId('pop-ahora')).toBeTruthy();
    expect(screen.queryByTestId('mapa-radar')).toBeNull();
    expect(screen.queryByText(/No se pudo obtener el pronóstico/)).toBeNull();
  });

  test('un radar desactualizado se ignora y se avisa', async () => {
    mockProveedores({
      indice: () => HttpResponse.json(indiceRadarFixture({ ahoraMs: AHORA.getTime(), edadUltimoMin: 55 })),
    });
    render(<App />);
    const fuentes = await screen.findByLabelText('Estado de fuentes');
    await waitFor(() => expect(within(fuentes).getByText(/Radar RainViewer/).textContent).toMatch(/hace 55 min/));
    expect(screen.queryByTestId('mapa-radar')).toBeNull();
  });
});
