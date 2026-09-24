import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const RAIZ = process.cwd();
const TMP = join(RAIZ, 'reportes', '.tmp');

function git(comando) {
  try {
    return execSync(comando, { cwd: RAIZ, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

function sello() {
  const ahora = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${ahora.getFullYear()}-${p(ahora.getMonth() + 1)}-${p(ahora.getDate())}_${p(ahora.getHours())}${p(ahora.getMinutes())}`;
}

function meta() {
  return {
    fecha: new Date().toLocaleString('es-MX', { hour12: false }),
    rama: git('git rev-parse --abbrev-ref HEAD') ?? 'desconocida',
    commit: git('git rev-parse --short HEAD') ?? 'sin-commit',
    node: process.version,
  };
}

function tablaMd(encabezados, filas) {
  const sep = encabezados.map(() => '---');
  return [encabezados, sep, ...filas].map((f) => `| ${f.join(' | ')} |`).join('\n');
}

function tipoDeArchivo(ruta) {
  const normal = ruta.replace(/\\/g, '/');
  if (normal.includes('tests/unit')) return 'Unitaria';
  if (normal.includes('tests/integration')) return 'Integración';
  return 'Otra';
}

function reporteUnitarias() {
  const rutaJson = join(TMP, 'vitest.json');
  if (!existsSync(rutaJson)) throw new Error(`No existe ${rutaJson}; corre primero las pruebas.`);
  const datos = JSON.parse(readFileSync(rutaJson, 'utf8'));
  const m = meta();

  let cobertura = '_Sin datos de cobertura._';
  const rutaCov = join(RAIZ, 'coverage', 'coverage-summary.json');
  if (existsSync(rutaCov)) {
    const cov = JSON.parse(readFileSync(rutaCov, 'utf8'));
    const filas = Object.entries(cov)
      .filter(([archivo]) => archivo !== 'total')
      .map(([archivo, v]) => {
        const rel = archivo.replace(/\\/g, '/').split('/src/').pop();
        return [`src/${rel}`, `${v.lines.pct}%`, `${v.statements.pct}%`, `${v.functions.pct}%`, `${v.branches.pct}%`];
      });
    if (cov.total) {
      filas.push(['**Total**', `**${cov.total.lines.pct}%**`, `**${cov.total.statements.pct}%**`, `**${cov.total.functions.pct}%**`, `**${cov.total.branches.pct}%**`]);
    }
    cobertura = tablaMd(['Módulo', 'Líneas', 'Sentencias', 'Funciones', 'Ramas'], filas);
  }

  const filasPruebas = [];
  for (const suite of datos.testResults ?? []) {
    const tipo = tipoDeArchivo(suite.name ?? '');
    for (const a of suite.assertionResults ?? []) {
      filasPruebas.push([tipo, (suite.name ?? '').replace(/\\/g, '/').split('/tests/').pop(), a.title, a.status === 'passed' ? '✅' : a.status]);
    }
  }

  const todoVerde = datos.numFailedTests === 0 && datos.numFailedTestSuites === 0;
  const contenido = `# Reporte de pruebas unitarias e integración

- **Fecha:** ${m.fecha}
- **Rama:** ${m.rama}
- **Commit:** ${m.commit}
- **Node:** ${m.node}

## Totales

${tablaMd(['Suites', 'Pruebas', 'Pasadas', 'Fallidas', 'Omitidas', 'Duración'], [[datos.numTotalTestSuites, datos.numTotalTests, datos.numPassedTests, datos.numFailedTests, datos.numPendingTests, `${((datos.testResults ?? []).reduce((s, t) => s + (t.endTime ?? 0) - (t.startTime ?? 0), 0) / 1000).toFixed(2)} s`]])}

## Detalle por archivo

${tablaMd(['Tipo', 'Archivo', 'Prueba', 'Estado'], filasPruebas)}

## Cobertura por módulo

${cobertura}

## Conclusión

${todoVerde ? '100% en verde. El código puede avanzar en el pipeline de ramas.' : 'Hay pruebas fallidas; el fix va directo a `develop` antes de continuar.'}
`;

  return { contenido, verde: todoVerde };
}

function recolectarSpecs(suites, archivo = '') {
  const salida = [];
  for (const s of suites ?? []) {
    const rutaArchivo = s.file ?? archivo;
    for (const spec of s.specs ?? []) {
      const ultimo = spec.tests?.[0]?.results?.slice(-1)[0];
      salida.push({
        archivo: (rutaArchivo ?? '').replace(/\\/g, '/'),
        titulo: `${s.title ? `${s.title} › ` : ''}${spec.title}`,
        estado: spec.ok ? '✅' : (ultimo?.status ?? 'desconocido'),
        duracion: ((ultimo?.duration ?? 0) / 1000).toFixed(1),
      });
    }
    salida.push(...recolectarSpecs(s.suites, rutaArchivo));
  }
  return salida;
}

function reporteE2e() {
  const rutaJson = join(TMP, 'playwright.json');
  if (!existsSync(rutaJson)) throw new Error(`No existe ${rutaJson}; corre primero las pruebas E2E.`);
  const datos = JSON.parse(readFileSync(rutaJson, 'utf8'));
  const m = meta();
  const stats = datos.stats ?? {};
  const specs = recolectarSpecs(datos.suites);
  const pasadas = stats.expected ?? 0;
  const fallidas = stats.unexpected ?? 0;
  const omitidas = stats.skipped ?? 0;
  const verde = fallidas === 0 && (stats.errors ?? 0) === 0;

  const contenido = `# Reporte de pruebas E2E (Playwright, contra \`vite preview\`)

- **Fecha:** ${m.fecha}
- **Rama:** ${m.rama}
- **Commit:** ${m.commit}
- **Node:** ${m.node}

## Totales

${tablaMd(['Pruebas', 'Pasadas', 'Fallidas', 'Omitidas', 'Duración'], [[pasadas + fallidas + omitidas, pasadas, fallidas, omitidas, `${((stats.duration ?? 0) / 1000).toFixed(1)} s`]])}

## Detalle por archivo

${tablaMd(['Archivo', 'Prueba', 'Estado', 'Duración (s)'], specs.map((s) => [s.archivo, s.titulo, s.estado, s.duracion]))}

## Conclusión

${verde ? '100% en verde. Se solicita el VoBo para el PR a `master`.' : 'Hay fallas E2E; corresponde abrir rama `bugfix/bug-<descripcion>` desde `testClimateRain`.'}
`;

  return { contenido, verde };
}

function actualizarIndice() {
  const dirReportes = join(RAIZ, 'reportes');
  const secciones = [];
  for (const tipo of ['unitarias', 'e2e']) {
    const dir = join(dirReportes, tipo);
    if (!existsSync(dir)) continue;
    const archivos = readdirSync(dir).filter((f) => f.endsWith('.md')).sort().reverse();
    if (archivos.length === 0) continue;
    const lineas = archivos.map((f) => `- [${f.replace('.md', '')}](${tipo}/${f})`);
    secciones.push(`## ${tipo === 'unitarias' ? 'Unitarias e integración' : 'E2E'}\n\n${lineas.join('\n')}`);
  }
  const contenido = `# Índice de reportes de pruebas

El más reciente primero. Los reportes HTML de Playwright y los JSON intermedios viven en \`reportes/.tmp/\` (ignorado por git).

${secciones.join('\n\n') || '_Sin reportes todavía._'}
`;
  writeFileSync(join(dirReportes, 'README.md'), contenido);
}

export function generarReporte(tipo) {
  const generador = tipo === 'unitarias' ? reporteUnitarias : tipo === 'e2e' ? reporteE2e : null;
  if (!generador) throw new Error(`Tipo desconocido: ${tipo} (usa "unitarias" o "e2e")`);
  const { contenido, verde } = generador();
  const m = meta();
  const dir = join(RAIZ, 'reportes', tipo);
  mkdirSync(dir, { recursive: true });
  const nombre = `${sello()}_${m.commit}.md`;
  writeFileSync(join(dir, nombre), contenido);
  actualizarIndice();
  return { ruta: join('reportes', tipo, nombre), verde };
}

const esCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (esCli) {
  const tipo = process.argv[2];
  try {
    const { ruta, verde } = generarReporte(tipo);
    console.log(`Reporte generado: ${ruta} (${verde ? 'verde' : 'con fallas'})`);
  } catch (error) {
    console.error(`Error al generar reporte: ${error.message}`);
    process.exit(1);
  }
}
