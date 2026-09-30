import { delay, http, HttpResponse } from 'msw';
import { describe, expect, test } from 'vitest';
import { fetchBlob, fetchJson, HttpError } from '../../src/providers/http';
import { server } from '../setup';

const URL_PRUEBA = 'https://ejemplo.test/dato';

describe('fetchJson', () => {
  test('devuelve el JSON de una respuesta correcta', async () => {
    server.use(http.get(URL_PRUEBA, () => HttpResponse.json({ a: 1 })));
    expect(await fetchJson(URL_PRUEBA)).toEqual({ a: 1 });
  });

  test('lanza HttpError con el estado cuando la respuesta no es 2xx', async () => {
    server.use(http.get(URL_PRUEBA, () => HttpResponse.json({}, { status: 502 })));
    await expect(fetchJson(URL_PRUEBA)).rejects.toMatchObject({ name: 'HttpError', status: 502 });
  });
});

describe('fetchBlob', () => {
  test('devuelve el cuerpo binario con su tipo', async () => {
    server.use(
      http.get(URL_PRUEBA, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3]).buffer, { headers: { 'content-type': 'image/png' } }),
      ),
    );
    const blob = await fetchBlob(URL_PRUEBA);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe(3);
  });

  test('lanza HttpError cuando la respuesta no es 2xx', async () => {
    server.use(http.get(URL_PRUEBA, () => new HttpResponse(null, { status: 404 })));
    const error = await fetchBlob(URL_PRUEBA).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(404);
  });

  test('aborta si el servidor tarda más que el tiempo límite', async () => {
    server.use(
      http.get(URL_PRUEBA, async () => {
        await delay(500);
        return HttpResponse.arrayBuffer(new ArrayBuffer(1));
      }),
    );
    await expect(fetchBlob(URL_PRUEBA, 30)).rejects.toThrow();
  });
});
