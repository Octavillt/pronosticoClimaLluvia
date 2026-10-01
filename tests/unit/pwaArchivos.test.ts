import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const RAIZ = process.cwd();

interface IconoManifest {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

function leerPng(ruta: string) {
  const buffer = readFileSync(ruta);
  const firmaPng = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(buffer.subarray(0, 8).equals(firmaPng)).toBe(true);
  return { ancho: buffer.readUInt32BE(16), alto: buffer.readUInt32BE(20) };
}

describe('consistencia de los archivos PWA', () => {
  const rutaManifest = join(RAIZ, 'public', 'manifest.webmanifest');
  const manifest = JSON.parse(readFileSync(rutaManifest, 'utf8')) as Record<string, unknown> & {
    icons: IconoManifest[];
  };

  test('el manifest existe, es JSON válido y trae los campos pedidos', () => {
    expect(manifest.name).toBe('SistemaClima');
    expect(manifest.short_name).toBe('Clima');
    expect(typeof manifest.description).toBe('string');
    expect(manifest.lang).toBe('es-MX');
    expect(manifest.id).toBe('./');
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toBe('#ffffff');
    expect(manifest.theme_color).toBe('#009966');
    expect(manifest.categories).toEqual(['weather']);
  });

  test('los íconos declarados existen y los PNG tienen las dimensiones declaradas', () => {
    const propositos = manifest.icons.map((icono) => `${icono.sizes} ${icono.purpose ?? 'any'}`);
    expect(propositos).toContain('192x192 any');
    expect(propositos).toContain('512x512 any');
    expect(propositos).toContain('512x512 maskable');
    expect(propositos).toContain('any any');

    for (const icono of manifest.icons) {
      const ruta = join(RAIZ, 'public', icono.src.replace(/^\.\//, ''));
      expect(existsSync(ruta), icono.src).toBe(true);
      if (icono.type !== 'image/svg+xml') {
        const { ancho, alto } = leerPng(ruta);
        expect(`${ancho}x${alto}`, icono.src).toBe(icono.sizes);
      }
    }
  });

  test('el apple-touch-icon existe y es PNG de 180x180', () => {
    const ruta = join(RAIZ, 'public', 'icons', 'apple-touch-icon.png');
    expect(existsSync(ruta)).toBe(true);
    expect(leerPng(ruta)).toEqual({ ancho: 180, alto: 180 });
  });

  test('index.html enlaza el manifest, el apple-touch-icon y el theme-color', () => {
    const html = readFileSync(join(RAIZ, 'index.html'), 'utf8');
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />');
    expect(html).toContain('<meta name="theme-color" content="#009966" />');
    expect(html).toContain('lang="es-MX"');
    expect(html).toContain('<title>SistemaClima</title>');
  });
});
