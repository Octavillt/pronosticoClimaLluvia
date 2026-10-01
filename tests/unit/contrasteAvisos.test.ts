import { describe, expect, test } from 'vitest';
import { COLORES_AVISO_ACTUALIZACION } from '../../src/ui/AvisoActualizacion';
import { COLORES_AVISO_SIN_CONEXION } from '../../src/ui/AvisoSinConexion';

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

describe('contraste WCAG AA de los avisos', () => {
  test.each([
    ['actualización', COLORES_AVISO_ACTUALIZACION],
    ['sin conexión', COLORES_AVISO_SIN_CONEXION],
  ])('el aviso de %s tiene al menos 4.5:1 para texto normal', (_nombre, colores) => {
    expect(razonContraste(colores.texto, colores.fondo)).toBeGreaterThanOrEqual(4.5);
  });
});
