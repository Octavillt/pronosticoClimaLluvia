import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { calcularVersion, recolectarPrecache, renderizarServiceWorker } from '../../vite/pwa';

function crearArchivos(directorio: string, archivos: Record<string, string>) {
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const completa = join(directorio, ruta);
    mkdirSync(join(completa, '..'), { recursive: true });
    writeFileSync(completa, contenido);
  }
}

const ARCHIVOS = {
  'index.html': '<html></html>',
  'assets/index-abc123.js': 'console.log(1)',
  'assets/index-abc123.css': 'body{}',
  'iconos/icono-192.png': 'png',
  'datos/regiones.json': '{}',
  'sw.js': 'service worker previo',
  'assets/index-abc123.js.map': '{}',
};

const ESPERADA = [
  './assets/index-abc123.css',
  './assets/index-abc123.js',
  './datos/regiones.json',
  './iconos/icono-192.png',
  './index.html',
];

describe('pwa: precaché y versión', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pwa-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('recolecta index.html, assets y subcarpetas; excluye sw.js y .map', () => {
    crearArchivos(dir, ARCHIVOS);
    expect(recolectarPrecache(dir)).toEqual(ESPERADA);
  });

  test('el orden es determinista sin importar el orden de escritura', () => {
    crearArchivos(dir, ARCHIVOS);
    const dir2 = mkdtempSync(join(tmpdir(), 'pwa-'));
    try {
      crearArchivos(dir2, Object.fromEntries(Object.entries(ARCHIVOS).reverse()));
      expect(recolectarPrecache(dir2)).toEqual(recolectarPrecache(dir));
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  test('la versión cambia si cambia el contenido de un archivo', () => {
    crearArchivos(dir, ARCHIVOS);
    const antes = calcularVersion(dir, recolectarPrecache(dir));
    crearArchivos(dir, { 'index.html': '<html>cambiado</html>' });
    expect(calcularVersion(dir, recolectarPrecache(dir))).not.toBe(antes);
  });

  test('la versión cambia si cambia el nombre de un archivo', () => {
    crearArchivos(dir, ARCHIVOS);
    const antes = calcularVersion(dir, recolectarPrecache(dir));
    rmSync(join(dir, 'assets/index-abc123.js'));
    writeFileSync(join(dir, 'assets/index-renombrado.js'), 'console.log(1)');
    expect(calcularVersion(dir, recolectarPrecache(dir))).not.toBe(antes);
  });

  test('builds idénticos dan la misma versión y el mismo sw.js', () => {
    crearArchivos(dir, ARCHIVOS);
    const dir2 = mkdtempSync(join(tmpdir(), 'pwa-'));
    try {
      crearArchivos(dir2, Object.fromEntries(Object.entries(ARCHIVOS).reverse()));
      const lista1 = recolectarPrecache(dir);
      const lista2 = recolectarPrecache(dir2);
      const version1 = calcularVersion(dir, lista1);
      expect(calcularVersion(dir2, lista2)).toBe(version1);
      expect(renderizarServiceWorker(lista1, version1)).toBe(
        renderizarServiceWorker(lista2, version1)
      );
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  test('los archivos ocultos (.DS_Store) no entran en la lista ni alteran la versión', () => {
    crearArchivos(dir, ARCHIVOS);
    const listaLimpia = recolectarPrecache(dir);
    const versionLimpia = calcularVersion(dir, listaLimpia);

    crearArchivos(dir, { '.DS_Store': 'basura', 'assets/.DS_Store': 'basura' });
    expect(recolectarPrecache(dir)).toEqual(listaLimpia);
    expect(calcularVersion(dir, recolectarPrecache(dir))).toBe(versionLimpia);
  });

  test('renderiza con una ruta de plantilla explícita', () => {
    const plantilla = join(dir, 'plantilla-propia.js');
    writeFileSync(plantilla, 'const V = "__VERSION__"; const P = __PRECACHE__;');
    const codigo = renderizarServiceWorker(['./index.html'], 'abc123', plantilla);
    expect(codigo).toBe('const V = "abc123"; const P = ["./index.html"];');
  });

  test('el renderizado incrusta versión y lista sin dejar marcadores', () => {
    crearArchivos(dir, ARCHIVOS);
    const lista = recolectarPrecache(dir);
    const version = calcularVersion(dir, lista);
    const codigo = renderizarServiceWorker(lista, version);
    expect(codigo).toContain(`const VERSION = '${version}'`);
    expect(codigo).toContain(JSON.stringify(lista));
    expect(codigo).not.toContain('__VERSION__');
    expect(codigo).not.toContain('__PRECACHE__');
  });
});
