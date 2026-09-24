import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, test } from 'vitest';
import { config } from '../../src/config';
import { obtenerPronostico } from '../../src/services/forecastService';
import { limpiarExpirados } from '../../src/services/cache';
import { ensambleFixture, forecastFixture, MODELOS_PRUEBA } from '../helpers/ensamble';
import { server } from '../setup';

const CDMX = { lat: 19.43, lon: -99.13 };

function contadorEnsemble() {
  const llamadas: string[] = [];
  return {
    llamadas,
    handler: http.get(`${config.urls.ensemble}`, ({ request }) => {
      llamadas.push(new URL(request.url).searchParams.get('models') ?? '');
      return HttpResponse.json(ensambleFixture());
    }),
  };
}

const handlerForecast = http.get(`${config.urls.forecast}`, () =>
  HttpResponse.json(forecastFixture()),
);

describe('forecastService', () => {
  beforeEach(async () => {
    await limpiarExpirados(Number.MAX_SAFE_INTEGER);
  });

  test('hace una sola llamada con los 5 modelos', async () => {
    const { llamadas, handler } = contadorEnsemble();
    server.use(handler, handlerForecast);

    const resultado = await obtenerPronostico(CDMX);

    expect(resultado.tipo).toBe('ok');
    expect(llamadas).toHaveLength(1);
    for (const modelo of MODELOS_PRUEBA) {
      expect(llamadas[0]).toContain(modelo);
    }
    if (resultado.tipo === 'ok') {
      expect(resultado.pop).toHaveLength(resultado.horasUtc.length);
      expect(resultado.fuentes.ensamble).toBe('ok');
      expect(resultado.fuentes.cache).toBe('miss');
    }
  });

  test('usa la caché en una segunda llamada de la misma celda', async () => {
    const { llamadas, handler } = contadorEnsemble();
    server.use(handler, handlerForecast);

    await obtenerPronostico(CDMX);
    const segunda = await obtenerPronostico({ lat: 19.432, lon: -99.134 });

    expect(llamadas).toHaveLength(1);
    expect(segunda.tipo).toBe('ok');
    if (segunda.tipo === 'ok') {
      expect(segunda.fuentes.cache).toBe('hit');
    }
  });

  test('cae al fallback por modelo y reporta modelosFallidos', async () => {
    let llamadaConjunta = 0;
    const porModelo: string[] = [];
    server.use(
      http.get(`${config.urls.ensemble}`, ({ request }) => {
        const modelos = new URL(request.url).searchParams.get('models') ?? '';
        if (modelos.includes(',')) {
          llamadaConjunta += 1;
          return HttpResponse.json({ error: 'boom' }, { status: 500 });
        }
        porModelo.push(modelos);
        if (modelos === 'gem_global_ensemble') {
          return HttpResponse.json({ error: 'boom' }, { status: 500 });
        }
        return HttpResponse.json(ensambleFixture({ modelos: [modelos] }));
      }),
      handlerForecast,
    );

    const resultado = await obtenerPronostico(CDMX);

    expect(llamadaConjunta).toBe(1);
    expect(porModelo).toHaveLength(5);
    expect(resultado.tipo).toBe('ok');
    if (resultado.tipo === 'ok') {
      expect(resultado.fuentes.ensamble).toBe('degradado');
      expect(resultado.fuentes.modelosFallidos).toEqual(['gem_global_ensemble']);
    }
  });

  test('lanza error si fallan la llamada conjunta y todos los modelos', async () => {
    server.use(
      http.get(`${config.urls.ensemble}`, () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
      handlerForecast,
    );
    await expect(obtenerPronostico(CDMX)).rejects.toThrow('No se pudo obtener el ensamble');
  });

  test('fuera de cobertura no llama a los proveedores', async () => {
    let llamadas = 0;
    server.use(
      http.get(`${config.urls.ensemble}`, () => {
        llamadas += 1;
        return HttpResponse.json(ensambleFixture());
      }),
      http.get(`${config.urls.forecast}`, () => {
        llamadas += 1;
        return HttpResponse.json(forecastFixture());
      }),
    );

    const resultado = await obtenerPronostico({ lat: 40.42, lon: -3.7 });

    expect(resultado).toEqual({ tipo: 'fuera-mexico', punto: { lat: 40.42, lon: -3.7 } });
    expect(llamadas).toBe(0);
  });

  test('si falla el complemento, sigue con datos del ensamble', async () => {
    const { handler } = contadorEnsemble();
    server.use(
      handler,
      http.get(`${config.urls.forecast}`, () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );

    const resultado = await obtenerPronostico(CDMX);

    expect(resultado.tipo).toBe('ok');
    if (resultado.tipo === 'ok') {
      expect(resultado.fuentes.complemento).toBe('error');
      expect(resultado.precipitacionMm).toHaveLength(resultado.horasUtc.length);
    }
  });
});
