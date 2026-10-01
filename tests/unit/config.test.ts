import { describe, expect, test } from 'vitest';
import { config } from '../../src/config';

describe('config', () => {
  test('tiene nombre de aplicación', () => {
    expect(config.appName).toBe('SistemaClima');
  });

  test('las URLs de proveedores son https', () => {
    for (const url of Object.values(config.urls)) {
      expect(url.startsWith('https://')).toBe(true);
    }
  });

  test('la llave de Google Weather es opcional y cadena', () => {
    expect(typeof config.googleWeatherKey).toBe('string');
  });

  test('los umbrales y constantes de la interfaz son coherentes', () => {
    const { alta, media, baja } = config.ui.umbralesPorcentaje;
    expect(alta).toBeGreaterThan(media);
    expect(media).toBeGreaterThan(baja);
    expect(baja).toBeGreaterThan(0);
    expect(alta).toBeLessThanOrEqual(100);
    expect(config.ui.pesoRadarVisible).toBeGreaterThan(0);
    expect(config.ui.pesoRadarVisible).toBeLessThan(1);
    expect(Number.isInteger(config.ui.horasPildoras)).toBe(true);
    expect(config.ui.horasPildoras).toBeGreaterThan(0);
    expect(Number.isInteger(config.ui.horasBusquedaFrase)).toBe(true);
    expect(config.ui.horasBusquedaFrase).toBeGreaterThan(0);
    expect(Number.isInteger(config.ui.horasSostenidasParaBajar)).toBe(true);
    expect(config.ui.horasSostenidasParaBajar).toBeGreaterThan(0);
  });
});
