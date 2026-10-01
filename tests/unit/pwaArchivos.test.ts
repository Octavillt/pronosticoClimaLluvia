import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
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
  const ancho = buffer.readUInt32BE(16);
  const alto = buffer.readUInt32BE(20);
  expect(buffer.toString('ascii', 12, 16), `${ruta}: falta IHDR`).toBe('IHDR');
  expect(buffer[24], `${ruta}: el PNG debe tener 8 bits por canal`).toBe(8);
  expect(buffer[25], `${ruta}: el PNG debe ser RGB (tipo 2)`).toBe(2);
  expect(buffer[26], `${ruta}: compresión PNG no compatible`).toBe(0);
  expect(buffer[27], `${ruta}: método de filtro PNG no compatible`).toBe(0);
  expect(buffer[28], `${ruta}: el PNG no debe estar entrelazado`).toBe(0);

  const datos: Buffer[] = [];
  for (let inicio = 8; inicio < buffer.length;) {
    expect(buffer.length - inicio, `${ruta}: cabecera de bloque truncada`).toBeGreaterThanOrEqual(12);
    const longitud = buffer.readUInt32BE(inicio);
    const fin = inicio + 12 + longitud;
    expect(fin, `${ruta}: bloque PNG truncado`).toBeLessThanOrEqual(buffer.length);
    const tipo = buffer.toString('ascii', inicio + 4, inicio + 8);
    if (tipo === 'IDAT') {
      datos.push(buffer.subarray(inicio + 8, inicio + 8 + longitud));
    }
    inicio = fin;
  }
  expect(datos.length, `${ruta}: faltan bloques IDAT`).toBeGreaterThan(0);
  const pixeles = inflateSync(Buffer.concat(datos));
  const longitudFila = 1 + ancho * 3;
  expect(pixeles.length, `${ruta}: tamaño RGB incorrecto`).toBe(alto * longitudFila);
  for (let fila = 0; fila < alto; fila++) {
    expect(pixeles[fila * longitudFila], `${ruta}: la fila ${fila} debe usar filtro 0`).toBe(0);
  }
  return { ancho, alto, primerPixel: `#${pixeles.subarray(1, 4).toString('hex')}` };
}

function leerTokens(): { claro: Record<string, string>; oscuro: Record<string, string> } {
  const css = readFileSync(join(RAIZ, 'src', 'estilos', 'tokens.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const bloqueClaro = css.match(/^\s*:root\s*\{([^}]*)\}/);
  const bloqueOscuro = css.match(
    /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/,
  );
  if (!bloqueClaro || !bloqueOscuro) {
    throw new Error('tokens.css debe definir los bloques de tema claro y oscuro');
  }
  function extraer(bloque: string): Record<string, string> {
    return Object.fromEntries([...bloque.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)]
      .map((coincidencia) => [coincidencia[1], coincidencia[2].trim()]));
  }
  const claro = extraer(bloqueClaro[1]);
  const oscuro = { ...claro, ...extraer(bloqueOscuro[1]) };
  for (const [tema, variables] of [['claro', claro], ['oscuro', oscuro]] as const) {
    for (const nombre of ['--color-cielo', '--color-fondo']) {
      expect(variables[nombre], `Tema ${tema}: falta el token hexadecimal ${nombre}`)
        .toMatch(/^#[\da-f]{6}$/);
    }
  }
  return { claro, oscuro };
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
    expect(manifest.background_color).toBe('#f6f5f2');
    expect(manifest.theme_color).toBe('#1e4f8f');
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
    expect(leerPng(ruta)).toMatchObject({ ancho: 180, alto: 180 });
  });

  test('index.html enlaza el manifest, el apple-touch-icon y el theme-color', () => {
    const html = readFileSync(join(RAIZ, 'index.html'), 'utf8');
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />');
    expect(html).toContain(
      '<meta name="theme-color" content="#1e4f8f" media="(prefers-color-scheme: light)" />',
    );
    expect(html).toContain(
      '<meta name="theme-color" content="#12335e" media="(prefers-color-scheme: dark)" />',
    );
    expect(html).toContain('lang="es-MX"');
    expect(html).toContain('<title>SistemaClima</title>');
  });

  test('los colores del manifest coinciden con los tokens del tema claro', () => {
    const { claro } = leerTokens();
    expect(manifest.theme_color).toBe(claro['--color-cielo']);
    expect(manifest.background_color).toBe(claro['--color-fondo']);
  });

  test('las dos metas theme-color coinciden con su tema y ninguna carece de media', () => {
    const { claro, oscuro } = leerTokens();
    const html = readFileSync(join(RAIZ, 'index.html'), 'utf8');
    const documento = new DOMParser().parseFromString(html, 'text/html');
    const metas = [...documento.querySelectorAll('meta[name="theme-color"]')];
    expect(metas).toHaveLength(2);
    expect(metas.filter((meta) => !meta.getAttribute('media'))).toHaveLength(0);
    for (const [tema, variables] of [['light', claro], ['dark', oscuro]] as const) {
      const delTema = metas.filter((meta) =>
        meta.getAttribute('media') === `(prefers-color-scheme: ${tema})`);
      expect(delTema, `Debe existir una única meta theme-color para ${tema}`).toHaveLength(1);
      expect(delTema[0].getAttribute('content'), `Meta theme-color ${tema}`).toBe(variables['--color-cielo']);
    }
  });

  test('el fondo del SVG coincide con el token de cielo claro', () => {
    const { claro } = leerTokens();
    const svg = readFileSync(join(RAIZ, 'public', 'icons', 'icon.svg'), 'utf8');
    const documento = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const fondos = documento.querySelectorAll('rect');
    expect(fondos).toHaveLength(1);
    expect(fondos[0].getAttribute('fill')).toBe(claro['--color-cielo']);
  });

  test.each(['icon-192.png', 'icon-512.png', 'icon-512-maskable.png', 'apple-touch-icon.png'])
    ('el píxel (0,0) de %s coincide con el token de cielo claro', (nombre) => {
      const { claro } = leerTokens();
      const { primerPixel } = leerPng(join(RAIZ, 'public', 'icons', nombre));
      expect(primerPixel, nombre).toBe(claro['--color-cielo']);
    });
});
