import { http, HttpResponse } from 'msw';
import { describe, expect, test } from 'vitest';
import { config } from '../../src/config';
import {
  fetchIndiceRadar,
  parseIndiceRadar,
  plantillaTilesMapa,
  urlTileCobertura,
  urlTileRadar,
} from '../../src/providers/rainviewer';
import { indiceRadarFixture } from '../helpers/radar';
import { server } from '../setup';

const HOST = 'https://tilecache.rainviewer.com';

describe('parseIndiceRadar', () => {
  test('lee host, instante de generación y frames', () => {
    const indice = parseIndiceRadar(indiceRadarFixture({ numFrames: 3 }));
    expect(indice.host).toBe(HOST);
    expect(indice.frames).toHaveLength(3);
    expect(indice.generadoS).toBeGreaterThan(0);
    expect(indice.frames[0].ruta).toMatch(/^\/v2\/radar\//);
  });

  test('ordena los frames del más viejo al más reciente', () => {
    const json = indiceRadarFixture({ numFrames: 3 });
    json.radar.past.reverse();
    const { frames } = parseIndiceRadar(json);
    expect(frames.map((f) => f.tiempoS)).toEqual([...frames.map((f) => f.tiempoS)].sort((a, b) => a - b));
  });

  test('acepta una lista vacía de frames (el servicio decide qué hacer)', () => {
    expect(parseIndiceRadar(indiceRadarFixture({ numFrames: 0 })).frames).toEqual([]);
  });

  test.each([
    ['http', 'http://tilecache.rainviewer.com'],
    ['otro dominio', 'https://evil.example.com'],
    ['dominio que solo contiene rainviewer.com', 'https://rainviewer.com.evil.com'],
    ['host con ruta', 'https://tilecache.rainviewer.com/x'],
  ])('rechaza un host no permitido (%s)', (_nombre, host) => {
    expect(() => parseIndiceRadar(indiceRadarFixture({ host }))).toThrow(/host no permitido/);
  });

  test.each([
    ['con ..', '/v2/radar/../../etc'],
    ['sin prefijo', '/otro/abc'],
    ['con parámetros', '/v2/radar/abc?x=1'],
  ])('rechaza una ruta de frame no permitida (%s)', (_nombre, path) => {
    const json = indiceRadarFixture({ numFrames: 1 });
    json.radar.past[0].path = path;
    expect(() => parseIndiceRadar(json)).toThrow(/frame mal formado/);
  });

  test.each([
    ['no es objeto', 'hola'],
    ['null', null],
    ['sin radar', { host: HOST }],
    ['past no es lista', { host: HOST, radar: { past: 3 } }],
    ['frame sin tiempo', { host: HOST, radar: { past: [{ path: '/v2/radar/a' }] } }],
  ])('rechaza un índice inválido (%s)', (_nombre, json) => {
    expect(() => parseIndiceRadar(json)).toThrow(/inválido/);
  });
});

describe('URLs', () => {
  test('el tile de radar sigue el formato de RainViewer con la paleta Universal Blue', () => {
    expect(urlTileRadar(HOST, '/v2/radar/abc', 7, 28, 56)).toBe(`${HOST}/v2/radar/abc/256/7/28/56/2/0_0.png`);
  });

  test('el tile de cobertura usa color y opciones en 0', () => {
    expect(urlTileCobertura(HOST, 7, 28, 56)).toBe(`${HOST}/v2/coverage/0/256/7/28/56/0/0_0.png`);
  });

  test('la plantilla del mapa deja {z}/{x}/{y} para Leaflet', () => {
    expect(plantillaTilesMapa(HOST, '/v2/radar/abc')).toBe(`${HOST}/v2/radar/abc/256/{z}/{x}/{y}/2/0_0.png`);
  });
});

describe('fetchIndiceRadar', () => {
  test('pide el índice público y lo interpreta', async () => {
    server.use(http.get(config.urls.rainviewer, () => HttpResponse.json(indiceRadarFixture({ numFrames: 5 }))));
    expect((await fetchIndiceRadar()).frames).toHaveLength(5);
  });

  test('propaga un error HTTP', async () => {
    server.use(http.get(config.urls.rainviewer, () => HttpResponse.json({}, { status: 503 })));
    await expect(fetchIndiceRadar()).rejects.toThrow(/HTTP 503/);
  });
});
