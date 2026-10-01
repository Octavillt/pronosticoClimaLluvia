import { expect, test, type Page } from '@playwright/test';
import {
  colorYFondo,
  hexARgb,
  leerTokens,
  preparar,
  razonContraste,
} from './soporte';

const TOKENS = leerTokens();
const TEMAS = [
  { nombre: 'claro', esquema: 'light' },
  { nombre: 'oscuro', esquema: 'dark' },
] as const;

async function abrirPronostico(page: Page, radar = false) {
  await page.goto('/');
  await expect(page.getByTestId('pop-ahora')).toBeVisible();
  if (radar) {
    await expect(page.getByTestId('mapa-radar')).toBeVisible();
  }
}

test.describe('Fase 5: tema claro y oscuro', () => {
  for (const { nombre, esquema } of TEMAS) {
    test(`el fondo de la página y del cielo siguen los tokens del tema ${nombre}`, async ({
      page,
      context,
    }) => {
      await preparar(page, context);
      await page.emulateMedia({ colorScheme: esquema });
      await abrirPronostico(page);

      const fondoPagina = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const fondoCielo = await page.locator('.cielo').evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(fondoPagina).toBe(hexARgb(TOKENS[nombre]['--color-fondo']));
      expect(fondoCielo).toBe(hexARgb(TOKENS[nombre]['--color-cielo']));
    });

    test(`el texto principal alcanza 4.5:1 de contraste con los colores renderizados (${nombre})`, async ({
      page,
      context,
    }) => {
      await preparar(page, context, { radar: true });
      await page.emulateMedia({ colorScheme: esquema });
      await abrirPronostico(page, true);
      // Un botón deshabilitado baja su opacidad a propósito: se mide ya habilitado.
      await expect(page.getByRole('button', { name: 'Sí, está lloviendo' })).toBeEnabled();

      const elementos = [
        '.cielo__hora',
        '.cielo__accion',
        '.cielo__frase',
        '.cielo__radar',
        '.pildora[data-actual] .pildora__hora',
        '.pildora:not([data-actual]) .pildora__porcentaje',
        '.radar__antiguedad',
        '.radar__hora',
        '.lluvia__subtitulo',
        '.lluvia .boton--primario',
        '.lluvia .boton--secundario',
        '.aprendizaje__texto',
        '.aprendizaje__alternar',
        '.datos__titulo',
        '.fuentes__lista li',
      ];
      const medidas: { selector: string; razon: number }[] = [];
      for (const selector of elementos) {
        if (await page.locator(selector).count() === 0) {
          continue;
        }
        const { color, fondo } = await colorYFondo(page, selector);
        medidas.push({ selector, razon: razonContraste(color, fondo) });
      }
      // Guarda contra pasar en vacío: los textos principales tienen que existir.
      expect(medidas.length).toBeGreaterThanOrEqual(12);
      const flojos = medidas.filter((medida) => medida.razon < 4.5);
      expect(flojos, `Tema ${nombre}: ${JSON.stringify(flojos)}`).toEqual([]);
    });

    test(`el foco del teclado es visible (${nombre})`, async ({ page, context }) => {
      await preparar(page, context);
      await page.emulateMedia({ colorScheme: esquema });
      await abrirPronostico(page);

      for (let i = 0; i < 6; i += 1) {
        await page.keyboard.press('Tab');
        if (await page.evaluate(() => document.activeElement?.classList.contains('cielo__cambiar'))) {
          break;
        }
      }
      const foco = await page.evaluate(() => {
        const activo = document.activeElement as HTMLElement | null;
        const estilo = activo ? getComputedStyle(activo) : null;
        return {
          clase: activo?.className ?? '',
          estilo: estilo?.outlineStyle ?? '',
          ancho: Number.parseFloat(estilo?.outlineWidth ?? '0'),
        };
      });
      expect(foco.clase).toContain('cielo__cambiar');
      expect(foco.estilo).not.toBe('none');
      expect(foco.ancho).toBeGreaterThanOrEqual(2);
    });
  }

  test('en tema oscuro la base del mapa se oscurece y la capa de radar no', async ({ page, context }) => {
    await preparar(page, context, { radar: true });
    await page.emulateMedia({ colorScheme: 'dark' });
    await abrirPronostico(page, true);
    await expect(page.locator('.leaflet-layer.mapa-radar__base')).toBeAttached();
    await expect(page.locator('.leaflet-tile-pane .leaflet-layer:not(.mapa-radar__base)').first())
      .toBeAttached();

    const filtros = await page.evaluate(() => ({
      base: getComputedStyle(document.querySelector('.leaflet-layer.mapa-radar__base')!).filter,
      radar: Array.from(document.querySelectorAll('.leaflet-tile-pane .leaflet-layer'))
        .filter((capa) => !capa.classList.contains('mapa-radar__base'))
        .map((capa) => getComputedStyle(capa).filter),
    }));
    expect(filtros.base).not.toBe('none');
    expect(filtros.base).toContain('invert');
    expect(filtros.radar.length).toBeGreaterThan(0);
    expect(filtros.radar.every((filtro) => filtro === 'none')).toBe(true);
  });

  test('en tema claro la base del mapa no se filtra', async ({ page, context }) => {
    await preparar(page, context, { radar: true });
    await page.emulateMedia({ colorScheme: 'light' });
    await abrirPronostico(page, true);
    await expect(page.locator('.leaflet-layer.mapa-radar__base')).toBeAttached();
    const filtro = await page.locator('.leaflet-layer.mapa-radar__base')
      .evaluate((el) => getComputedStyle(el).filter);
    expect(filtro).toBe('none');
  });

  test('con movimiento reducido no hay desplazamiento suave ni transiciones', async ({ page, context }) => {
    await preparar(page, context);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await abrirPronostico(page);

    const reducido = await page.evaluate(() => ({
      desplazamiento: getComputedStyle(document.documentElement).scrollBehavior,
      boton: getComputedStyle(document.querySelector('.aprendizaje__alternar')!).transitionDuration,
      chevron: getComputedStyle(document.querySelector('.aprendizaje__chevron')!).transitionDuration,
    }));
    expect(reducido.desplazamiento).toBe('auto');
    expect(reducido.boton).toBe('0s');
    expect(reducido.chevron).toBe('0s');

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const normal = await page.evaluate(() => ({
      desplazamiento: getComputedStyle(document.documentElement).scrollBehavior,
      chevron: getComputedStyle(document.querySelector('.aprendizaje__chevron')!).transitionDuration,
    }));
    expect(normal.desplazamiento).toBe('smooth');
    expect(normal.chevron).not.toBe('0s');
  });

  test('las fuentes propias cargan y no se pide nada a servidores de tipografías', async ({
    page,
    context,
  }) => {
    const pagina = await preparar(page, context);
    await abrirPronostico(page);
    await page.evaluate(() => document.fonts.ready);

    const fuentes = await page.evaluate(() => ({
      titulos: document.fonts.check('700 20px "Bricolage Grotesque"'),
      texto: document.fonts.check('400 16px Figtree'),
      cargadas: Array.from(document.fonts).filter((fuente) => fuente.status === 'loaded').length,
    }));
    expect(fuentes.titulos).toBe(true);
    expect(fuentes.texto).toBe(true);
    expect(fuentes.cargadas).toBeGreaterThanOrEqual(2);
    expect(pagina.solicitudes.filter((url) => /fonts\.g(oogleapis|static)\.com/.test(url))).toEqual([]);
    expect(pagina.errores).toEqual([]);
  });
});
