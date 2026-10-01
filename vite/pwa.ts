import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

// Tanto `vite build` como Vitest se ejecutan desde la raíz del proyecto.
const RUTA_PLANTILLA = join(process.cwd(), 'vite', 'sw.template.js');

// Lista de rutas relativas ('./...') a precachear: todo el build menos sw.js, los .map
// y los archivos ocultos (p. ej. un .DS_Store que llegue a public/).
export function recolectarPrecache(directorio: string): string[] {
  const lista: string[] = [];
  const recorrer = (dir: string) => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, entrada.name);
      if (entrada.isDirectory()) {
        recorrer(ruta);
      } else if (
        !entrada.name.startsWith('.') &&
        entrada.name !== 'sw.js' &&
        !entrada.name.endsWith('.map')
      ) {
        lista.push('./' + relative(directorio, ruta).split(sep).join('/'));
      }
    }
  };
  recorrer(directorio);
  return lista.sort();
}

// Hash corto de rutas + contenidos: dos builds idénticos producen la misma versión.
export function calcularVersion(directorio: string, lista: string[]): string {
  const hash = createHash('sha256');
  for (const ruta of lista) {
    hash.update(ruta);
    hash.update(readFileSync(join(directorio, ruta.slice(2))));
  }
  return hash.digest('hex').slice(0, 12);
}

export function renderizarServiceWorker(
  lista: string[],
  version: string,
  plantilla: string = RUTA_PLANTILLA
): string {
  const contenido = readFileSync(plantilla, 'utf8');
  return contenido.replaceAll('__VERSION__', version).replaceAll('__PRECACHE__', JSON.stringify(lista));
}

// Escribe dist/sw.js al final del build; en dev no se registra (apply: 'build').
export function pwaSistemaclima(): Plugin {
  let salida = 'dist';
  let plantilla = RUTA_PLANTILLA;
  return {
    name: 'sistemaclima-pwa',
    apply: 'build',
    enforce: 'post',
    configResolved(configuracion) {
      // Rutas contra la raíz que Vite ya conoce, no contra el cwd del proceso.
      salida = resolve(configuracion.root, configuracion.build.outDir);
      plantilla = join(configuracion.root, 'vite', 'sw.template.js');
    },
    closeBundle() {
      const lista = recolectarPrecache(salida);
      const version = calcularVersion(salida, lista);
      writeFileSync(join(salida, 'sw.js'), renderizarServiceWorker(lista, version, plantilla));
      console.log(`[pwa] sw.js: ${lista.length} archivos precacheados, versión ${version}`);
    },
  };
}
