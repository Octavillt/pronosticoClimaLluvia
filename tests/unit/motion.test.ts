import { describe, expect, test } from 'vitest';
import { estimarDesplazamiento, estimarMovimiento } from '../../src/nowcast/motion';
import { campoConDisco } from '../helpers/radar';

const LADO = 768;
const CENTRO = 384;

/** Mancha gaussiana de pico 45 dBZ; permite desplazamientos con decimales. */
function gaussiana(cx: number, cy: number, sigma = 12): Float32Array {
  const campo = new Float32Array(LADO * LADO).fill(-32);
  for (let y = 0; y < LADO; y += 1) {
    for (let x = 0; x < LADO; x += 1) {
      const r2 = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
      const valor = 45 * Math.exp(-r2 / (2 * sigma * sigma));
      if (valor > 1) {
        campo[y * LADO + x] = valor;
      }
    }
  }
  return campo;
}

describe('estimarDesplazamiento', () => {
  test('recupera un desplazamiento entero (+6, −4) px', () => {
    const antes = campoConDisco(LADO, 380, 390, 20, 35);
    const despues = campoConDisco(LADO, 386, 386, 20, 35);
    const resultado = estimarDesplazamiento(antes, despues, LADO, CENTRO, CENTRO);
    expect(resultado.tipo).toBe('ok');
    if (resultado.tipo === 'ok') {
      expect(resultado.dx).toBeCloseTo(6, 0);
      expect(resultado.dy).toBeCloseTo(-4, 0);
      expect(resultado.calidad).toBeGreaterThan(0.95);
    }
  });

  test('refina con precisión subpíxel un desplazamiento de +2.5 px', () => {
    const resultado = estimarDesplazamiento(gaussiana(380, 384), gaussiana(382.5, 384), LADO, CENTRO, CENTRO);
    expect(resultado.tipo).toBe('ok');
    if (resultado.tipo === 'ok') {
      expect(resultado.dx).toBeGreaterThan(2.2);
      expect(resultado.dx).toBeLessThan(2.8);
      expect(Math.abs(resultado.dy)).toBeLessThan(0.3);
    }
  });

  test('sin ecos en la ventana no hay nada que seguir', () => {
    const vacio = new Float32Array(LADO * LADO).fill(-32);
    expect(estimarDesplazamiento(vacio, vacio, LADO, CENTRO, CENTRO)).toEqual({ tipo: 'sin-ecos' });
  });

  test('pocos ecos (menos que el mínimo) también cuentan como sin ecos', () => {
    const diminuto = campoConDisco(LADO, CENTRO, CENTRO, 4, 35);
    expect(estimarDesplazamiento(diminuto, diminuto, LADO, CENTRO, CENTRO).tipo).toBe('sin-ecos');
  });

  test('es incierto si el desplazamiento real excede el radio de búsqueda', () => {
    const antes = campoConDisco(LADO, 340, CENTRO, 20, 35);
    const despues = campoConDisco(LADO, 372, CENTRO, 20, 35);
    expect(estimarDesplazamiento(antes, despues, LADO, CENTRO, CENTRO).tipo).toBe('incierto');
  });

  test('es incierto si los frames no se parecen', () => {
    const antes = campoConDisco(LADO, 300, 300, 20, 35);
    const despues = campoConDisco(LADO, 450, 450, 20, 35);
    expect(estimarDesplazamiento(antes, despues, LADO, CENTRO, CENTRO).tipo).toBe('incierto');
  });

  test('rechaza un mosaico demasiado chico para la ventana', () => {
    const chico = new Float32Array(100 * 100);
    expect(() => estimarDesplazamiento(chico, chico, 100, 50, 50)).toThrow(/demasiado chico/);
  });
});

describe('estimarMovimiento', () => {
  const DIEZ_MIN = 600_000;

  test('convierte el desplazamiento entre frames a px/min', () => {
    const campos = [0, 1, 2].map((i) => ({
      tMs: i * DIEZ_MIN,
      dbz: campoConDisco(LADO, 360 + i * 5, 384 - i * 3, 20, 35),
    }));
    const movimiento = estimarMovimiento(campos, LADO, CENTRO, CENTRO);
    expect(movimiento.estado).toBe('estimado');
    if (movimiento.estado === 'estimado') {
      expect(movimiento.vxPxMin).toBeCloseTo(0.5, 1);
      expect(movimiento.vyPxMin).toBeCloseTo(-0.3, 1);
      expect(movimiento.calidad).toBeGreaterThan(0.9);
    }
  });

  test('usa los minutos reales entre frames, no un paso fijo', () => {
    const campos = [
      { tMs: 0, dbz: campoConDisco(LADO, 370, 384, 20, 35) },
      { tMs: 20 * 60_000, dbz: campoConDisco(LADO, 380, 384, 20, 35) },
    ];
    const movimiento = estimarMovimiento(campos, LADO, CENTRO, CENTRO);
    expect(movimiento.estado === 'estimado' && movimiento.vxPxMin).toBeCloseTo(0.5, 1);
  });

  test('sin ecos → "sin-ecos"', () => {
    const vacio = new Float32Array(LADO * LADO).fill(-32);
    const campos = [0, 1].map((i) => ({ tMs: i * DIEZ_MIN, dbz: vacio }));
    expect(estimarMovimiento(campos, LADO, CENTRO, CENTRO)).toEqual({ estado: 'sin-ecos' });
  });

  test('ecos sin correlación → "incierto"', () => {
    const campos = [
      { tMs: 0, dbz: campoConDisco(LADO, 300, 300, 20, 35) },
      { tMs: DIEZ_MIN, dbz: campoConDisco(LADO, 450, 450, 20, 35) },
    ];
    expect(estimarMovimiento(campos, LADO, CENTRO, CENTRO)).toEqual({ estado: 'incierto' });
  });

  test('si un par falla y otro acierta, usa el que acierta', () => {
    const campos = [
      { tMs: 0, dbz: campoConDisco(LADO, 300, 300, 20, 35) },
      { tMs: DIEZ_MIN, dbz: campoConDisco(LADO, 380, 384, 20, 35) },
      { tMs: 2 * DIEZ_MIN, dbz: campoConDisco(LADO, 385, 384, 20, 35) },
    ];
    const movimiento = estimarMovimiento(campos, LADO, CENTRO, CENTRO);
    expect(movimiento.estado).toBe('estimado');
    if (movimiento.estado === 'estimado') {
      expect(movimiento.vxPxMin).toBeCloseTo(0.5, 1);
      // La calidad se promedia sobre todos los pares, así que baja si uno falló.
      expect(movimiento.calidad).toBeLessThan(0.6);
    }
  });

  test('una sola imagen no da movimiento', () => {
    const campos = [{ tMs: 0, dbz: campoConDisco(LADO, 380, 384, 20, 35) }];
    expect(estimarMovimiento(campos, LADO, CENTRO, CENTRO)).toEqual({ estado: 'sin-ecos' });
  });
});
