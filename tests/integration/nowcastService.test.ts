import { describe, expect, test } from 'vitest';
import type { IndiceRadar, TileRgba } from '../../src/domain/types';
import { pixelGlobal } from '../../src/nowcast/tiles';
import { parseIndiceRadar } from '../../src/providers/rainviewer';
import { obtenerNowcast, type DependenciasNowcast } from '../../src/services/nowcastService';
import { cargadorSintetico, indiceRadarFixture, tormentaQueAvanza, ZOOM } from '../helpers/radar';

const CDMX = { lat: 19.43, lon: -99.13 };
const AHORA = Date.parse('2026-09-30T03:36:00Z');
const P = pixelGlobal(CDMX, ZOOM);

/** Banda de lluvia de ~46 km de radio, a 60 px del punto a las 03:26, que avanza hacia él. */
function bandaHaciaElPunto(vxPxMin = 0.5) {
  return tormentaQueAvanza({
    gx0: P.x - Math.sign(vxPxMin) * 60,
    gy0: P.y,
    t0Ms: AHORA - 10 * 60_000,
    vxPxMin,
    vyPxMin: 0,
    radioPx: 40,
  });
}

function dependencias(
  opciones: {
    indice?: IndiceRadar;
    dbz?: ReturnType<typeof tormentaQueAvanza>;
    cubierto?: (gx: number, gy: number) => boolean;
    fallan?: RegExp;
  } = {},
) {
  const solicitudes: string[] = [];
  const cargar = cargadorSintetico(
    { dbz: opciones.dbz ?? bandaHaciaElPunto(), cubierto: opciones.cubierto ?? (() => true) },
    solicitudes,
  );
  const deps: DependenciasNowcast = {
    obtenerIndice: async () => opciones.indice ?? parseIndiceRadar(indiceRadarFixture({ ahoraMs: AHORA })),
    cargarTile: async (url: string): Promise<TileRgba> => {
      if (opciones.fallan?.test(url)) {
        solicitudes.push(url);
        throw new Error('HTTP 500');
      }
      return cargar(url);
    },
  };
  return { deps, solicitudes };
}

describe('obtenerNowcast', () => {
  test('con cobertura estima el avance de la lluvia y proyecta su llegada', async () => {
    const { deps } = dependencias();
    const resultado = await obtenerNowcast(CDMX, AHORA, deps);

    expect(resultado.tipo).toBe('ok');
    if (resultado.tipo !== 'ok') return;
    const { nowcast } = resultado;
    expect(nowcast.tFrameMs).toBe(AHORA - 10 * 60_000);
    expect(nowcast.movimiento.estado).toBe('estimado');
    // 0.5 px/min × ~1153 m/px ≈ 34.6 km/h hacia el este.
    expect(nowcast.avance!.kmh).toBeGreaterThan(30);
    expect(nowcast.avance!.kmh).toBeLessThan(40);
    expect(Math.abs(nowcast.avance!.haciaGrados - 90)).toBeLessThan(5);

    const en = (min: number) => nowcast.pronostico[min / 10].pop;
    expect(en(0)).toBeLessThan(0.05);
    expect(en(120)).toBeGreaterThan(0.9);
    expect(nowcast.observados).toHaveLength(2);
    expect(nowcast.pronostico.every((p) => p.cobertura === 1)).toBe(true);
  });

  test('devuelve el índice completo para que la UI dibuje el mapa', async () => {
    const { deps } = dependencias();
    const resultado = await obtenerNowcast(CDMX, AHORA, deps);
    expect(resultado.tipo === 'ok' && resultado.indice.frames).toHaveLength(13);
  });

  test('solo descarga los últimos 3 frames: 9 tiles de cobertura + 27 de radar', async () => {
    const { deps, solicitudes } = dependencias();
    await obtenerNowcast(CDMX, AHORA, deps);

    const radar = solicitudes.filter((u) => u.includes('/v2/radar/'));
    const cobertura = solicitudes.filter((u) => u.includes('/v2/coverage/'));
    expect(cobertura).toHaveLength(9);
    expect(radar).toHaveLength(27);
    expect(new Set(radar.map((u) => u.split('/')[5])).size).toBe(3);
    expect(radar.every((u) => u.includes('/256/7/'))).toBe(true);
  });

  test('sin cobertura en el punto termina tras un solo tile, sin bajar el radar', async () => {
    const { deps, solicitudes } = dependencias({ cubierto: () => false });
    const resultado = await obtenerNowcast(CDMX, AHORA, deps);

    expect(resultado).toEqual({ tipo: 'sin-cobertura' });
    expect(solicitudes).toHaveLength(1);
    expect(solicitudes[0]).toContain('/v2/coverage/');
  });

  test('un frame demasiado viejo se descarta sin pedir tiles', async () => {
    const indice = parseIndiceRadar(indiceRadarFixture({ ahoraMs: AHORA, edadUltimoMin: 60 }));
    const { deps, solicitudes } = dependencias({ indice });
    const resultado = await obtenerNowcast(CDMX, AHORA, deps);

    expect(resultado.tipo).toBe('desactualizado');
    expect(resultado.tipo === 'desactualizado' && resultado.edadMin).toBeCloseTo(60, 0);
    expect(solicitudes).toHaveLength(0);
  });

  test('con menos de 2 frames no hay movimiento que estimar', async () => {
    const indice = parseIndiceRadar(indiceRadarFixture({ ahoraMs: AHORA, numFrames: 1 }));
    const { deps, solicitudes } = dependencias({ indice });
    const resultado = await obtenerNowcast(CDMX, AHORA, deps);

    expect(resultado.tipo).toBe('sin-datos');
    expect(solicitudes).toHaveLength(0);
  });

  test('si falla un tile vecino, sigue con menos cobertura en esa zona', async () => {
    // La lluvia viene del este (avanza hacia el oeste) y el punto está cerca del borde este de
    // su tile: los pasos lejanos miran "aguas arriba" dentro del tile de la derecha, que falla.
    const central = Math.floor(P.x / 256);
    const { deps } = dependencias({
      dbz: bandaHaciaElPunto(-0.7),
      fallan: new RegExp(`/v2/(radar/f\\d+|coverage/0)/256/7/${central + 1}/`),
    });
    const resultado = await obtenerNowcast(CDMX, AHORA, deps);

    expect(resultado.tipo).toBe('ok');
    if (resultado.tipo !== 'ok') return;
    expect(resultado.nowcast.pronostico[0].cobertura).toBe(1);
    expect(resultado.nowcast.pronostico.at(-1)!.cobertura).toBeLessThan(1);
  });

  test('si falla el tile central de radar no hay datos utilizables', async () => {
    const central = Math.floor(P.x / 256);
    const centralY = Math.floor(P.y / 256);
    const { deps } = dependencias({ fallan: new RegExp(`/v2/radar/f\\d+/256/7/${central}/${centralY}/`) });
    const resultado = await obtenerNowcast(CDMX, AHORA, deps);
    expect(resultado.tipo).toBe('sin-datos');
  });

  test('si falla el tile central de cobertura lanza el error (para que la UI lo reporte)', async () => {
    const { deps } = dependencias({ fallan: /\/v2\/coverage\// });
    await expect(obtenerNowcast(CDMX, AHORA, deps)).rejects.toThrow(/HTTP 500/);
  });

  test('un cielo sin ecos da "sin-ecos" y una probabilidad de radar casi nula', async () => {
    const { deps } = dependencias({ dbz: () => null });
    const resultado = await obtenerNowcast(CDMX, AHORA, deps);

    expect(resultado.tipo).toBe('ok');
    if (resultado.tipo !== 'ok') return;
    expect(resultado.nowcast.movimiento).toEqual({ estado: 'sin-ecos' });
    expect(resultado.nowcast.avance).toBeNull();
    expect(resultado.nowcast.pronostico.every((p) => p.pop < 0.03)).toBe(true);
  });

  test('propaga el error si no se puede leer el índice de RainViewer', async () => {
    const deps: DependenciasNowcast = {
      obtenerIndice: async () => {
        throw new Error('HTTP 503 al pedir el índice');
      },
      cargarTile: async () => {
        throw new Error('no debería llamarse');
      },
    };
    await expect(obtenerNowcast(CDMX, AHORA, deps)).rejects.toThrow(/HTTP 503/);
  });
});
