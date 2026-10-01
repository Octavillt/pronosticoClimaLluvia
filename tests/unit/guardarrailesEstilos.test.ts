import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

// Estas listas se vacían en la última tarea de la fase conforme se migra cada componente.
const COLORES_PENDIENTES: string[] = [
  'src/ui/AvisoActualizacion.tsx',
  'src/ui/AvisoSinConexion.tsx',
  'src/ui/PanelExactitud.tsx',
];
const ESTILOS_EN_LINEA_PENDIENTES: string[] = [
  'src/ui/AvisoActualizacion.tsx',
  'src/ui/AvisoSinConexion.tsx',
  'src/ui/PanelExactitud.tsx',
];

const raiz = process.cwd();
const rutaTokens = 'src/estilos/tokens.css';

function quitarComentarios(contenido: string): string {
  return contenido.replace(
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,
    (fragmento) => fragmento.startsWith('/*') || fragmento.startsWith('//') ? '' : fragmento,
  );
}

function primerColor(contenido: string): string | undefined {
  const limpio = quitarComentarios(contenido);
  const colores = /#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})\b|\b(?:rgba?|hsla?)\s*\(/gi;
  for (const coincidencia of limpio.matchAll(colores)) {
    const anterior = limpio.slice(0, coincidencia.index);
    if (coincidencia[0].startsWith('#') && /(?:url\(\s*['"]?|(?:xlink:)?href\s*=\s*['"])$/i.test(anterior)) {
      continue;
    }
    return coincidencia[0];
  }
  return undefined;
}

function primerEstiloInvalido(contenido: string): string | undefined {
  const limpio = quitarComentarios(contenido);
  for (const atributo of limpio.matchAll(/\bstyle\s*=\s*/g)) {
    const valor = limpio.slice(atributo.index + atributo[0].length);
    if (!/^\{\s*\{/.test(valor)) {
      return `${atributo[0]}${valor.split(/[\r\n]/)[0]}`;
    }
    const inicioObjeto = valor.indexOf('{', 1);
    const objeto = leerObjeto(valor.slice(inicioObjeto));
    const cierre = /^\s*(?:as\s+CSSProperties(?:\s*&\s*Record<\s*`--\$\{string\}`\s*,\s*string\s*>)?\s*)?\}/;
    const valido = objeto && cierre.test(valor.slice(inicioObjeto + objeto.fin))
      && objeto.propiedades.every((propiedad) => /^(['"])--[\w-]+\1\s*:\s*\S/.test(propiedad.trim()));
    if (!valido) {
      return `${atributo[0]}${valor.slice(0, inicioObjeto + (objeto?.fin ?? 80) + 1)}`;
    }
  }
  return undefined;
}

function leerObjeto(contenido: string): { fin: number; propiedades: string[] } | undefined {
  const fragmentos = contenido.matchAll(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[\s\S]/g);
  const cierres: string[] = [];
  const propiedades: string[] = [];
  let inicio = 1;
  for (const fragmento of fragmentos) {
    const token = fragmento[0];
    if (['{', '[', '('].includes(token)) {
      cierres.push(token === '{' ? '}' : token === '[' ? ']' : ')');
    } else if (['}', ']', ')'].includes(token)) {
      if (cierres.pop() !== token) {
        return undefined;
      }
      if (cierres.length === 0) {
        const ultima = contenido.slice(inicio, fragmento.index).trim();
        if (ultima) {
          propiedades.push(ultima);
        }
        return { fin: fragmento.index + 1, propiedades };
      }
    } else if (token === ',' && cierres.length === 1) {
      propiedades.push(contenido.slice(inicio, fragmento.index));
      inicio = fragmento.index + 1;
    }
  }
  return undefined;
}

function recorrer(directorio: string): string[] {
  return readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(directorio, entrada.name);
    if (entrada.isDirectory()) {
      return relative(raiz, ruta).replaceAll('\\', '/') === 'src/assets' ? [] : recorrer(ruta);
    }
    return /\.(?:ts|tsx|css)$/.test(entrada.name) ? [ruta] : [];
  });
}

const archivos = recorrer(resolve(raiz, 'src')).sort().map((ruta) => ({
  ruta: relative(raiz, ruta).replaceAll('\\', '/'),
  contenido: quitarComentarios(readFileSync(ruta, 'utf8')),
}));
const css = archivos.filter((archivo) => archivo.ruta.endsWith('.css'));
const estilos = archivos.filter((archivo) => /\.(?:css|tsx)$/.test(archivo.ruta));
const variables = new Set(css.flatMap((archivo) =>
  [...archivo.contenido.matchAll(/(--[\w-]+)\s*:/g)].map((coincidencia) => coincidencia[1]),
));

function comprobarRatchet(
  pendientes: string[],
  regla: string,
  verificar: (contenido: string) => string | undefined,
  candidatos: typeof archivos,
): void {
  test(`${regla}: ningún incumplimiento nuevo`, () => {
    const nuevos = candidatos.flatMap((archivo) => {
      const coincidencia = verificar(archivo.contenido);
      return coincidencia !== undefined && !pendientes.includes(archivo.ruta)
        ? [`${archivo.ruta}: ${regla}; primera coincidencia: ${coincidencia}`] : [];
    });
    expect(nuevos, nuevos.join('\n')).toEqual([]);
  });

  test(`${regla}: cada pendiente sigue incumpliendo`, () => {
    expect(new Set(pendientes).size, `${regla}: hay archivos duplicados`).toBe(pendientes.length);
    for (const ruta of pendientes) {
      const archivo = candidatos.find((candidato) => candidato.ruta === ruta);
      const coincidencia = archivo && verificar(archivo.contenido);
      expect(coincidencia, `${ruta}: ${regla}; ya cumple o no existe, quítalo de la lista`).toBeDefined();
    }
  });
}

describe('autopruebas de los verificadores de estilos', () => {
  test.each(['color: #1f5fae', 'rgba(0, 0, 0, .5)', '#fff', '#abcd', '#ffffffff', 'hsl(0, 0%, 0%)'])
    ('detecta color literal: %s', (contenido) => {
      expect(primerColor(contenido)).toBeDefined();
    });

  test.each(['url(#clip0)', 'url(#abc)', 'href="#abcdef"', 'xlink:href="#abc"',
    '/* color: #123456 */', '// color: #123456\nconst x = 1;'])
    ('acepta referencia SVG o comentario: %s', (contenido) => {
      expect(primerColor(contenido)).toBeUndefined();
    });

  test.each(["style={{ color: 'red' }}", 'style={estilo}', 'style="color: red"',
    'style={{ ...estilo }}', 'style={{ [clave]: 1 }}'])
    ('detecta atributo de estilo inválido: %s', (atributo) => {
      expect(primerEstiloInvalido(`<div ${atributo} />`)).toBeDefined();
    });

  test("acepta style={{ '--ancho': '40px' }}", () => {
    expect(primerEstiloInvalido("<div style={{ '--ancho': '40px' }} />")).toBeUndefined();
  });

  test.each([
    "style={{ '--tramo': x } as CSSProperties}",
    "style={{ '--tramo': x } as CSSProperties & Record<`--${string}`, string>}",
  ])('acepta variables CSS con aserción de tipo: %s', (atributo) => {
    expect(primerEstiloInvalido(`<div ${atributo} />`)).toBeUndefined();
  });

  test.each([
    "style={{ color: 'red' } as CSSProperties}",
    "style={{ '--tramo': x, color: 'red' } as CSSProperties}",
    'style={variable as CSSProperties}',
    "style={{ '--tramo': x } as desconocido}",
    "style={{ '--tramo': x } as CSSProperties || variable}",
  ])('rechaza aserciones que eluden la regla: %s', (atributo) => {
    expect(primerEstiloInvalido(`<div ${atributo} />`)).toBeDefined();
  });

  test('el recorrido incluye tokens y componentes', () => {
    expect(archivos.some((archivo) => archivo.ruta === rutaTokens)).toBe(true);
    expect(archivos.some((archivo) => archivo.ruta === 'src/App.tsx')).toBe(true);
  });
});

describe('guardarraíles de estilos con ratchet', () => {
  comprobarRatchet(COLORES_PENDIENTES, 'colores literales', primerColor,
    archivos.filter((archivo) => archivo.ruta !== rutaTokens));
  comprobarRatchet(ESTILOS_EN_LINEA_PENDIENTES, 'style solo con variables CSS', primerEstiloInvalido,
    archivos.filter((archivo) => archivo.ruta.endsWith('.tsx')));

  test('todas las variables utilizadas están declaradas en CSS', () => {
    for (const archivo of estilos) {
      for (const coincidencia of archivo.contenido.matchAll(/\bvar\(\s*(--[\w-]+)\s*(?:,|\))/g)) {
        expect(variables.has(coincidencia[1]),
          `${archivo.ruta}: variable CSS sin definir; primera coincidencia: ${coincidencia[0]}`).toBe(true);
      }
    }
  });

  test('ningún estilo elimina el foco visible', () => {
    for (const archivo of estilos) {
      const coincidencia = archivo.contenido.match(
        /\b(?:outline(?:-style)?|outlineStyle)['"]?\s*:\s*['"]?(?:none\b|0(?:px)?\b)/i,
      );
      expect(coincidencia,
        `${archivo.ruta}: foco eliminado; primera coincidencia: ${coincidencia?.[0]}`).toBeNull();
    }
  });

  test('el tema automático solo se declara en tokens o MapaRadar.css', () => {
    for (const archivo of archivos) {
      if ([rutaTokens, 'src/ui/MapaRadar.css'].includes(archivo.ruta)) {
        continue;
      }
      const coincidencia = archivo.contenido.match(/prefers-color-scheme/i);
      expect(coincidencia,
        `${archivo.ruta}: tema fuera de tokens; primera coincidencia: ${coincidencia?.[0]}`).toBeNull();
    }
  });

  test('no se usan capas ni CSS Modules', () => {
    for (const archivo of css) {
      expect(archivo.ruta.endsWith('.module.css'), `${archivo.ruta}: CSS Modules prohibido`).toBe(false);
      const coincidencia = archivo.contenido.match(/@layer\b/i);
      expect(coincidencia,
        `${archivo.ruta}: capas prohibidas; primera coincidencia: ${coincidencia?.[0]}`).toBeNull();
    }
  });

  test('las líneas de CSS no superan 110 columnas', () => {
    for (const archivo of css) {
      const lineas = readFileSync(resolve(raiz, archivo.ruta), 'utf8').split(/\r?\n/);
      const indice = lineas.findIndex((linea) => linea.length > 110);
      expect(indice,
        `${archivo.ruta}: más de 110 columnas; línea ${indice + 1}: ${lineas[indice]}`).toBe(-1);
    }
  });
});
