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
});
