import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cargarTile } from '../../src/providers/rainviewer';
import { server } from '../setup';

const URL_TILE = 'https://tilecache.rainviewer.com/v2/radar/abc/256/7/28/56/2/0_0.png';

function servirPng() {
  server.use(
    http.get(URL_TILE, () =>
      HttpResponse.arrayBuffer(new Uint8Array([137, 80, 78, 71]).buffer, { headers: { 'content-type': 'image/png' } }),
    ),
  );
}

/** Canvas falso: `getImageData` devuelve un patrón reconocible. */
function instalarCanvasFalso(opciones: { sinContexto?: boolean } = {}) {
  const dibujos: unknown[] = [];
  class OffscreenCanvasFalso {
    constructor(
      public width: number,
      public height: number,
    ) {}
    getContext() {
      if (opciones.sinContexto) return null;
      return {
        drawImage: (imagen: unknown) => dibujos.push(imagen),
        getImageData: (_x: number, _y: number, ancho: number, alto: number) => ({
          data: new Uint8ClampedArray(ancho * alto * 4).fill(9),
          width: ancho,
          height: alto,
        }),
      };
    }
  }
  vi.stubGlobal('OffscreenCanvas', OffscreenCanvasFalso);
  return dibujos;
}

describe('cargarTile', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('descarga el PNG, lo dibuja en un canvas y devuelve sus píxeles RGBA', async () => {
    servirPng();
    const dibujos = instalarCanvasFalso();
    const cerrar = vi.fn();
    const imagen = { width: 2, height: 3, close: cerrar };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(imagen));

    const tile = await cargarTile(URL_TILE);

    expect(tile.ancho).toBe(2);
    expect(tile.alto).toBe(3);
    expect(tile.data).toHaveLength(2 * 3 * 4);
    expect(dibujos).toEqual([imagen]);
    expect(cerrar).toHaveBeenCalledOnce();
  });

  test('pide la decodificación sin conversión de color para conservar la paleta exacta', async () => {
    servirPng();
    instalarCanvasFalso();
    const crear = vi.fn().mockResolvedValue({ width: 1, height: 1, close: vi.fn() });
    vi.stubGlobal('createImageBitmap', crear);

    await cargarTile(URL_TILE);

    expect(crear).toHaveBeenCalledWith(expect.any(Blob), { colorSpaceConversion: 'none' });
  });

  test('si el navegador no soporta esas opciones, reintenta sin ellas', async () => {
    servirPng();
    instalarCanvasFalso();
    const crear = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('opciones no soportadas'))
      .mockResolvedValueOnce({ width: 1, height: 1, close: vi.fn() });
    vi.stubGlobal('createImageBitmap', crear);

    const tile = await cargarTile(URL_TILE);

    expect(tile.ancho).toBe(1);
    expect(crear).toHaveBeenCalledTimes(2);
    expect(crear.mock.calls[1]).toHaveLength(1);
  });

  test('sin contexto 2D lanza error y aun así libera la imagen', async () => {
    servirPng();
    instalarCanvasFalso({ sinContexto: true });
    const cerrar = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 1, height: 1, close: cerrar }));

    await expect(cargarTile(URL_TILE)).rejects.toThrow(/Canvas 2D no disponible/);
    expect(cerrar).toHaveBeenCalledOnce();
  });

  test('propaga el error HTTP de la descarga', async () => {
    server.use(http.get(URL_TILE, () => new HttpResponse(null, { status: 500 })));
    await expect(cargarTile(URL_TILE)).rejects.toThrow(/HTTP 500/);
  });
});
