import { expect, test, type Page } from '@playwright/test';
import { historialVerificacion } from '../tests/helpers/verificacion';
import { preparar, sinDesbordamiento, type OpcionesPagina } from './soporte';

const TEMAS = [
  { nombre: 'claro', esquema: 'light' },
  { nombre: 'oscuro', esquema: 'dark' },
] as const;

interface Estado {
  nombre: string;
  opciones: OpcionesPagina;
  /** Deja la pantalla en el estado a medir, ya cargada. */
  llegar: (page: Page) => Promise<void>;
  /** Mensajes de consola esperados por el propio escenario (p. ej. el 500 simulado). */
  toleraRecurso?: boolean;
}

const ESTADOS: Estado[] = [
  {
    nombre: 'listo',
    opciones: {},
    llegar: async (page) => {
      await expect(page.getByTestId('pop-ahora')).toBeVisible();
    },
  },
  {
    nombre: 'listo con radar',
    opciones: { radar: true },
    llegar: async (page) => {
      await expect(page.getByTestId('pop-ahora')).toBeVisible();
      await expect(page.getByTestId('mapa-radar')).toBeVisible();
    },
  },
  {
    nombre: 'detalle de exactitud abierto',
    opciones: {},
    llegar: async (page) => {
      await expect(page.getByTestId('pop-ahora')).toBeVisible();
      // Con 150 horas verificadas el detalle trae sus tablas y la gráfica completas.
      await page.getByLabel('Importar historial').setInputFiles({
        name: 'historial.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(historialVerificacion(150))),
      });
      await expect(page.getByRole('status')).toContainText('Se agregaron');
      await page.getByRole('button', { name: 'Ver detalle de exactitud' }).click();
      await expect(page.getByRole('cell', { name: 'Calibrado', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Por horizonte' })).toBeVisible();
    },
  },
  {
    nombre: 'error',
    opciones: { ensambleFalla: true },
    toleraRecurso: true,
    llegar: async (page) => {
      await expect(page.getByRole('alert')).toContainText(/No se pudo obtener/);
    },
  },
  {
    nombre: 'fuera de México',
    opciones: { ubicacion: 'madrid' },
    llegar: async (page) => {
      await expect(page.getByRole('alert')).toContainText(/fuera de México/);
    },
  },
  {
    nombre: 'búsqueda de ciudad con resultados',
    opciones: { ubicacion: 'denegada' },
    llegar: async (page) => {
      await page.getByLabel('Nombre de la ciudad').fill('Guadalajara');
      await page.getByRole('button', { name: 'Buscar', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Guadalajara, Jalisco' })).toBeVisible();
    },
  },
];

test.describe('Fase 5: diseño adaptable', () => {
  for (const estado of ESTADOS) {
    for (const { nombre, esquema } of TEMAS) {
      test(`a 320 px de ancho no hay desbordamiento ni errores: ${estado.nombre}, tema ${nombre}`, async ({
        page,
        context,
      }) => {
        const pagina = await preparar(page, context, estado.opciones);
        await page.setViewportSize({ width: 320, height: 800 });
        await page.emulateMedia({ colorScheme: esquema });
        await page.goto('/');
        await estado.llegar(page);

        expect(await sinDesbordamiento(page)).toBe(true);
        const errores = estado.toleraRecurso
          ? pagina.errores.filter((texto) => !texto.startsWith('Failed to load resource'))
          : pagina.errores;
        expect(errores).toEqual([]);
      });
    }
  }

  test('con el texto al 200 % (viewport de 640 px) no hay desbordamiento', async ({ page, context }) => {
    await preparar(page, context);
    await page.setViewportSize({ width: 640, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('pop-ahora')).toBeVisible();
    expect(await sinDesbordamiento(page)).toBe(true);
  });

  test('en escritorio la columna mide 560 px, está centrada y el cielo es una tarjeta redondeada', async ({
    page,
    context,
  }) => {
    await preparar(page, context);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(page.getByTestId('pop-ahora')).toBeVisible();

    const principal = await page.locator('main.app').boundingBox();
    const cielo = await page.locator('.cielo').boundingBox();
    expect(principal).not.toBeNull();
    expect(cielo).not.toBeNull();
    expect(principal!.width).toBeLessThanOrEqual(560);
    expect(Math.abs(principal!.x - (1280 - principal!.width) / 2)).toBeLessThanOrEqual(1);
    expect(cielo!.width).toBeCloseTo(principal!.width, 0);
    const radios = await page.locator('.cielo').evaluate((el) => {
      const estilo = getComputedStyle(el);
      return [
        estilo.borderTopLeftRadius, estilo.borderTopRightRadius,
        estilo.borderBottomRightRadius, estilo.borderBottomLeftRadius,
      ];
    });
    expect(radios).toEqual(['32px', '32px', '32px', '32px']);
    expect(await sinDesbordamiento(page)).toBe(true);
  });

  test('en móvil el cielo ocupa todo el ancho y solo se redondean sus esquinas inferiores', async ({
    page,
    context,
  }) => {
    await preparar(page, context);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/');
    await expect(page.getByTestId('pop-ahora')).toBeVisible();

    const cielo = await page.locator('.cielo').boundingBox();
    expect(cielo!.x).toBeCloseTo(0, 0);
    expect(cielo!.width).toBeCloseTo(320, 0);
    const radios = await page.locator('.cielo').evaluate((el) => {
      const estilo = getComputedStyle(el);
      return [
        estilo.borderTopLeftRadius, estilo.borderTopRightRadius,
        estilo.borderBottomRightRadius, estilo.borderBottomLeftRadius,
      ];
    });
    expect(radios).toEqual(['0px', '0px', '32px', '32px']);
  });
});
