import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { horasUtcDesdeEpoch, PARAMETROS_TIEMPO } from '../src/providers/tiempoOpenMeteo';
import { formatHoraLocal } from '../src/utils/localTime';
import { ensambleFixture, forecastFixture } from '../tests/helpers/ensamble';
import { indiceRadarFixture } from '../tests/helpers/radar';

const CDMX = { latitude: 19.43, longitude: -99.13 };

async function conGeolocalizacion(
  context: BrowserContext,
  punto: { latitude: number; longitude: number },
) {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(punto);
}

async function conProveedoresSimulados(page: Page) {
  // Sin frames de radar: el nowcast termina sin pedir tiles.
  await page.route('**/api.rainviewer.com/**', (ruta) =>
    ruta.fulfill({ json: indiceRadarFixture({ numFrames: 0 }) }),
  );
  await page.route('**/ensemble-api.open-meteo.com/**', (ruta) =>
    ruta.fulfill({ json: ensambleFixture() }),
  );
  await page.route('**/api.open-meteo.com/**', (ruta) =>
    ruta.fulfill({ json: forecastFixture() }),
  );
  await page.route('**/geocoding-api.open-meteo.com/**', (ruta) =>
    ruta.fulfill({
      json: {
        results: [
          { name: 'Guadalajara', latitude: 20.67, longitude: -103.35, admin1: 'Jalisco' },
        ],
      },
    }),
  );
}

test.describe('Fase 1: pronóstico con fixtures', () => {
  test('flujo feliz en CDMX muestra la probabilidad', async ({ page, context }) => {
    await conGeolocalizacion(context, CDMX);
    await conProveedoresSimulados(page);

    await page.goto('/');

    await expect(page.getByTestId('pop-ahora')).toBeVisible();
    await expect(page.getByRole('img', { name: /próximas horas/ })).toBeVisible();
    await expect(page.getByRole('list').filter({ hasText: 'Ensamble Open-Meteo' })).toBeVisible();
  });

  test('permiso denegado y búsqueda de Guadalajara', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_exito, error) => {
        error?.({
          code: 1,
          message: 'denegado',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        } as GeolocationPositionError);
      };
    });
    await conProveedoresSimulados(page);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Busca tu ciudad' })).toBeVisible();

    await page.getByLabel('Nombre de la ciudad').fill('Guadalajara');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await page.getByRole('button', { name: /Guadalajara, Jalisco/ }).click();

    await expect(page.getByTestId('pop-ahora')).toBeVisible();
    await expect(page.getByText('Guadalajara', { exact: true })).toBeVisible();
  });

  test('Madrid muestra el mensaje de fuera de cobertura', async ({ page, context }) => {
    await conGeolocalizacion(context, { latitude: 40.42, longitude: -3.7 });
    let llamadasProveedores = 0;
    await page.route('**/open-meteo.com/**', (ruta) => {
      llamadasProveedores += 1;
      return ruta.fulfill({ json: {} });
    });

    await page.goto('/');

    await expect(page.getByRole('alert')).toContainText(/fuera de México/);
    expect(llamadasProveedores).toBe(0);
  });

  test('Open-Meteo caído muestra error y el reintento recupera', async ({ page, context }) => {
    await conGeolocalizacion(context, CDMX);
    let caido = true;
    await page.route('**/ensemble-api.open-meteo.com/**', (ruta) =>
      caido
        ? ruta.fulfill({ status: 500, json: { error: 'boom' } })
        : ruta.fulfill({ json: ensambleFixture() }),
    );
    await page.route('**/api.open-meteo.com/**', (ruta) =>
      caido
        ? ruta.fulfill({ status: 500, json: { error: 'boom' } })
        : ruta.fulfill({ json: forecastFixture() }),
    );
    await page.route('**/api.rainviewer.com/**', (ruta) =>
      ruta.fulfill({ json: indiceRadarFixture({ numFrames: 0 }) }),
    );

    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText(/No se pudo obtener/);

    caido = false;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByTestId('pop-ahora')).toBeVisible();
  });
});

test.describe('Fase 1: @vivo contra Open-Meteo real', () => {
  test('@vivo devuelve ~194 miembros y PoP en [0,1]', async ({ request }) => {
    const params = new URLSearchParams({
      latitude: String(CDMX.latitude),
      longitude: String(CDMX.longitude),
      hourly: 'precipitation',
      forecast_days: '1',
      models: 'ecmwf_ifs025,ecmwf_aifs025,ncep_gefs_seamless,icon_global_eps,gem_global_ensemble',
      ...PARAMETROS_TIEMPO,
    });
    let respuesta;
    try {
      respuesta = await request.get(`https://ensemble-api.open-meteo.com/v1/ensemble?${params}`);
    } catch {
      test.skip(true, 'Open-Meteo no responde');
      return;
    }
    if (!respuesta.ok()) {
      test.skip(true, `Open-Meteo respondió ${respuesta.status()}`);
      return;
    }
    const json = await respuesta.json();
    const hourly = json.hourly as Record<string, (number | null)[] | number[]>;
    const series = Object.entries(hourly).filter(
      ([clave, valor]) => clave.startsWith('precipitation') && Array.isArray(valor),
    );
    expect(series.length).toBeGreaterThanOrEqual(180);

    const horas = (hourly.time as number[]).length;
    for (let h = 0; h < horas; h += 1) {
      let llueven = 0;
      for (const [, valores] of series) {
        const valor = (valores as (number | null)[])[h];
        if (valor !== null && valor >= 0.2) llueven += 1;
      }
      const pop = (llueven + 0.5) / (series.length + 1);
      expect(pop).toBeGreaterThan(0);
      expect(pop).toBeLessThan(1);
    }
  });

  interface RespuestaVivo {
    timezone?: string;
    utc_offset_seconds?: number;
    hourly?: { time?: number[] };
  }

  /** Desfase (s) de la zona en el instante dado: lo que Intl calcula como hora local − hora UTC. */
  function desfaseSegundos(zona: string, epochS: number): number {
    const partes = new Intl.DateTimeFormat('en-US', {
      timeZone: zona,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(epochS * 1000));
    const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
    // Con hour12:false la medianoche sale como 24: en-US la trata como h24, no como h00.
    const localMs = Date.UTC(
      valor('year'),
      valor('month') - 1,
      valor('day'),
      valor('hour') % 24,
      valor('minute'),
      valor('second'),
    );
    return Math.round((localMs - epochS * 1000) / 1000);
  }

  const PUNTOS_VIVO = [
    { nombre: 'CDMX', latitude: 19.43, longitude: -99.13, zona: 'America/Mexico_City' },
    { nombre: 'Tijuana', latitude: 32.5, longitude: -117.0, zona: 'America/Tijuana' },
    { nombre: 'Cancún', latitude: 21.16, longitude: -86.85, zona: 'America/Cancun' },
  ] as const;

  function urlVivo(base: string, punto: (typeof PUNTOS_VIVO)[number], conModelos: boolean): string {
    const params = new URLSearchParams({
      latitude: String(punto.latitude),
      longitude: String(punto.longitude),
      hourly: 'precipitation',
      forecast_days: '1',
      ...PARAMETROS_TIEMPO,
    });
    if (conModelos) {
      params.set('models', 'ecmwf_ifs025');
    }
    return `${base}?${params.toString()}`;
  }

  test('@vivo la zona y las horas del punto son correctas en ambos endpoints', async ({ request }) => {
    const endpoints = [
      ['ensamble', 'https://ensemble-api.open-meteo.com/v1/ensemble', true],
      ['complemento', 'https://api.open-meteo.com/v1/forecast', false],
    ] as const;

    for (const punto of PUNTOS_VIVO) {
      const primeros: Record<string, number> = {};
      for (const [nombre, base, conModelos] of endpoints) {
        let respuesta;
        try {
          respuesta = await request.get(urlVivo(base, punto, conModelos));
        } catch {
          test.skip(true, 'Open-Meteo no responde');
          return;
        }
        if (!respuesta.ok()) {
          test.skip(true, `Open-Meteo respondió ${respuesta.status()}`);
          return;
        }
        const json = (await respuesta.json()) as unknown as RespuestaVivo;
        const tiempos = json.hourly?.time ?? [];
        const donde = `${punto.nombre}/${nombre}`;

        expect(json.timezone, `${donde}: zona`).toBe(punto.zona);
        expect(tiempos.length, `${donde}: horas`).toBeGreaterThan(1);
        expect(Number.isInteger(tiempos[0]), `${donde}: epoch enteros`).toBe(true);
        for (let i = 1; i < tiempos.length; i += 1) {
          expect(Number.isInteger(tiempos[i]), `${donde}: epoch enteros`).toBe(true);
          expect(tiempos[i] - tiempos[i - 1], `${donde}: paso de 3600 s`).toBe(3600);
        }
        expect(json.utc_offset_seconds, `${donde}: desfase`).toBe(desfaseSegundos(punto.zona, tiempos[0]));
        expect(formatHoraLocal(horasUtcDesdeEpoch([tiempos[0]])[0], punto.zona), `${donde}: medianoche local`)
          .toBe('00:00');
        primeros[nombre] = tiempos[0];
      }
      // El eje horario debe ser el mismo en los dos endpoints del mismo punto.
      expect(primeros.complemento, `${punto.nombre}: mismo eje horario`).toBe(primeros.ensamble);
    }
  });
});
