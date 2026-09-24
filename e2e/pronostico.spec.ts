import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { ensambleFixture, forecastFixture } from '../tests/helpers/ensamble';

const CDMX = { latitude: 19.43, longitude: -99.13 };

async function conGeolocalizacion(
  context: BrowserContext,
  punto: { latitude: number; longitude: number },
) {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(punto);
}

async function conProveedoresSimulados(page: Page) {
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
    await expect(page.getByText(/Guadalajara/)).toBeVisible();
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
      timezone: 'UTC',
      models: 'ecmwf_ifs025,ecmwf_aifs025,ncep_gefs_seamless,icon_global_eps,gem_global_ensemble',
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
    const hourly = json.hourly as Record<string, (number | null)[] | string[]>;
    const series = Object.entries(hourly).filter(
      ([clave, valor]) => clave.startsWith('precipitation') && Array.isArray(valor),
    );
    expect(series.length).toBeGreaterThanOrEqual(180);

    const horas = (hourly.time as string[]).length;
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
});
