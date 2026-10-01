import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

type Variables = Record<string, string>;

const css = readFileSync(resolve(process.cwd(), 'src/estilos/tokens.css'), 'utf8');
const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
const bloqueClaro = sinComentarios.match(/^\s*:root\s*\{([^}]*)\}/);
const bloqueOscuro = sinComentarios.match(
  /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/,
);

function extraerVariables(bloque: string | undefined): Variables {
  return Object.fromEntries(
    [...(bloque ?? '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)]
      .map((coincidencia) => [coincidencia[1], coincidencia[2].trim()]),
  );
}

const claro = extraerVariables(bloqueClaro?.[1]);
const oscuro = extraerVariables(bloqueOscuro?.[1]);
const temas = [
  { nombre: 'claro', variables: claro },
  { nombre: 'oscuro', variables: { ...claro, ...oscuro } },
];

function resolverColor(variables: Variables, nombre: string, visitadas: string[] = []): string {
  const valor = variables[nombre];
  if (valor === undefined) {
    throw new Error(`Falta la variable ${nombre}`);
  }
  if (visitadas.includes(nombre)) {
    throw new Error(`Referencia circular en ${nombre}: ${[...visitadas, nombre].join(' -> ')}`);
  }
  const referencia = valor.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (referencia) {
    return resolverColor(variables, referencia[1], [...visitadas, nombre]);
  }
  if (!/^#[0-9a-f]{6}$/i.test(valor)) {
    throw new Error(`La variable ${nombre} debe ser un hexadecimal de 6 dígitos; recibido: ${valor}`);
  }
  return valor;
}

function luminanciaRelativa(hex: string): number {
  const canales = [1, 3, 5].map((inicio) => {
    const canal = Number.parseInt(hex.slice(inicio, inicio + 2), 16) / 255;
    return canal <= 0.04045 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * canales[0] + 0.7152 * canales[1] + 0.0722 * canales[2];
}

function razonContraste(texto: string, fondo: string): number {
  const luminancias = [luminanciaRelativa(texto), luminanciaRelativa(fondo)];
  return (Math.max(...luminancias) + 0.05) / (Math.min(...luminancias) + 0.05);
}

const paresTexto = [
  ['texto', 'fondo'],
  ['texto', 'tarjeta'],
  ['texto-suave', 'fondo'],
  ['texto-suave', 'tarjeta'],
  ['sobre-cielo', 'cielo'],
  ['sobre-cielo-suave', 'cielo'],
  ['sobre-cielo', 'cielo-chip'],
  ['sobre-cielo-suave', 'cielo-chip'],
  ['sobre-accion', 'accion'],
  ['accion-texto', 'tarjeta'],
  ['accion-texto', 'accion-suave'],
  ['texto-sobre-accion-suave', 'accion-suave'],
  ['aviso-texto', 'aviso-fondo'],
  ['aviso-boton-texto', 'aviso-boton-fondo'],
  ['sin-conexion-texto', 'sin-conexion-fondo'],
  ['error-texto', 'error-fondo'],
  ['primario', 'tarjeta'],
  ['primario', 'fondo'],
  ['texto-suave', 'pista'],
] as const;

const paresNoTextuales = [
  ['linea-control', 'tarjeta'],
  ['linea-control', 'fondo'],
  ['primario', 'tarjeta'],
  ['primario', 'fondo'],
  ['accion', 'tarjeta'],
  ['accion', 'fondo'],
] as const;

describe('fórmula WCAG 2.x y lectura de tokens', () => {
  test('negro sobre blanco tiene contraste 21:1', () => {
    expect(razonContraste('#000000', '#ffffff')).toBe(21);
  });

  test('gris #777777 sobre blanco tiene contraste aproximado 4.48:1', () => {
    expect(razonContraste('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });

  test('los bloques contienen suficientes colores para evitar pruebas vacías', () => {
    expect(bloqueClaro, 'No se encontró el bloque :root del tema claro').not.toBeNull();
    expect(bloqueOscuro, 'No se encontró el bloque del tema oscuro').not.toBeNull();
    expect(Object.keys(claro).filter((nombre) => nombre.startsWith('--color-')).length)
      .toBeGreaterThanOrEqual(28);
    expect(Object.keys(oscuro).filter((nombre) => nombre.startsWith('--color-')).length)
      .toBeGreaterThanOrEqual(20);
  });

  test('resuelve referencias y rechaza colores ausentes, inválidos o circulares', () => {
    expect(resolverColor({ '--base': '#ffffff', '--alias': 'var(--base)' }, '--alias')).toBe('#ffffff');
    expect(() => resolverColor({}, '--ausente')).toThrow('--ausente');
    expect(() => resolverColor({ '--invalido': '#fff' }, '--invalido')).toThrow('--invalido');
    expect(() => resolverColor({ '--circular': 'var(--circular)' }, '--circular')).toThrow('--circular');
  });
});

describe.each(temas)('contraste de tokens: tema $nombre', ({ nombre, variables }) => {
  function verificarContraste(frente: string, fondo: string, minimo: number): void {
    const contexto = `Tema ${nombre}, --color-${frente} sobre --color-${fondo}`;
    let colorFrente: string;
    let colorFondo: string;
    try {
      colorFrente = resolverColor(variables, `--color-${frente}`);
      colorFondo = resolverColor(variables, `--color-${fondo}`);
    } catch (error) {
      throw new Error(`${contexto}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const contraste = razonContraste(colorFrente, colorFondo);
    expect(contraste, `${contexto}: ${contraste.toFixed(3)}:1; mínimo ${minimo}:1`)
      .toBeGreaterThanOrEqual(minimo);
  }

  test.each(paresTexto)('texto %s sobre %s alcanza 4.5:1', (texto, fondo) => {
    verificarContraste(texto, fondo, 4.5);
  });

  test.each(paresNoTextuales)('elemento no textual %s sobre %s alcanza 3:1', (frente, fondo) => {
    verificarContraste(frente, fondo, 3);
  });
});
