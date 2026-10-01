import { describe, expect, test } from 'vitest';
import { colorDeDbz, TRAMOS_LEYENDA } from '../../src/nowcast/leyenda';
import { PALETA_OPACA } from '../../src/nowcast/paleta';

describe('leyenda de la paleta real del radar', () => {
  test('hay exactamente cuatro tramos con sus claves, etiquetas y dBZ en orden', () => {
    expect(TRAMOS_LEYENDA.map(({ clave, etiqueta, dbz }) => ({ clave, etiqueta, dbz }))).toEqual([
      { clave: 'ligera', etiqueta: 'Ligera', dbz: 20 },
      { clave: 'moderada', etiqueta: 'Moderada', dbz: 30 },
      { clave: 'fuerte', etiqueta: 'Fuerte', dbz: 40 },
      { clave: 'intensa', etiqueta: 'Intensa', dbz: 50 },
    ]);
  });

  test.each(TRAMOS_LEYENDA)('$etiqueta usa el color opaco de $dbz dBZ en hexadecimal minúsculo', (tramo) => {
    const entrada = PALETA_OPACA.find(([dbz]) => dbz === tramo.dbz);
    expect(entrada, `El tramo ${tramo.clave} debe existir en PALETA_OPACA`).toBeDefined();
    expect(tramo.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(Number.parseInt(tramo.color.slice(1), 16)).toBe(entrada?.[1]);
  });

  test('los cuatro colores conservan los valores reales de Universal Blue', () => {
    expect(TRAMOS_LEYENDA.map(({ color }) => color)).toEqual(['#00a3e0', '#005588', '#ffaa00', '#c10000']);
  });

  test('16 dBZ conserva su color y 14 dBZ no pertenece a la paleta opaca', () => {
    expect(colorDeDbz(16)).toBe('#6cd1eb');
    expect(() => colorDeDbz(14)).toThrow('14 dBZ');
  });
});
