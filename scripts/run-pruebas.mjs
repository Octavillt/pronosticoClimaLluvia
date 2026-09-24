import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { generarReporte } from './reporte-pruebas.mjs';

const tipo = process.argv[2];
const headed = process.argv.includes('--headed');

const entradas = {
  unitarias: { script: join('node_modules', 'vitest', 'vitest.mjs'), args: ['run', '--coverage'] },
  e2e: { script: join('node_modules', '@playwright', 'test', 'cli.js'), args: ['test', ...(headed ? ['--headed'] : [])] },
};

const entrada = entradas[tipo];
if (!entrada) {
  console.error(`Tipo desconocido: ${tipo} (usa "unitarias" o "e2e")`);
  process.exit(1);
}

const hijo = spawn(process.execPath, [entrada.script, ...entrada.args], { stdio: 'inherit' });

hijo.on('close', (codigo) => {
  try {
    const { ruta, verde } = generarReporte(tipo);
    console.log(`\nReporte generado: ${ruta} (${verde ? '100% verde' : 'con fallas'})`);
  } catch (error) {
    console.error(`\nNo se pudo generar el reporte: ${error.message}`);
    if (codigo === 0) process.exit(1);
  }
  process.exit(codigo ?? 1);
});
