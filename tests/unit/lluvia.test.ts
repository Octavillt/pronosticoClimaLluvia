import { describe, expect, test } from 'vitest';
import {
  MENSAJE_ACCION,
  NBSP,
  nivelDeLluvia,
  porcentajeMostrado,
} from '../../src/utils/lluvia';

describe('porcentajeMostrado', () => {
  test('los bordes de .5 no se corren por el ruido de coma flotante', () => {
    expect(porcentajeMostrado(0.095)).toBe(10);
    expect(porcentajeMostrado(0.295)).toBe(30);
    expect(porcentajeMostrado(0.595)).toBe(60);
    expect(porcentajeMostrado(0.0949)).toBe(9);
    expect(porcentajeMostrado(0.2949)).toBe(29);
    expect(porcentajeMostrado(0.5949)).toBe(59);
  });

  test('acota a 0..100 y no se rompe con valores fuera de rango o inválidos', () => {
    expect(porcentajeMostrado(0)).toBe(0);
    expect(porcentajeMostrado(1)).toBe(100);
    expect(porcentajeMostrado(-0.2)).toBe(0);
    expect(porcentajeMostrado(1.7)).toBe(100);
    expect(porcentajeMostrado(Number.NaN)).toBe(0);
    expect(porcentajeMostrado(Number.POSITIVE_INFINITY)).toBe(0);
    expect(porcentajeMostrado(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe('nivelDeLluvia', () => {
  test('clasifica el porcentaje que se muestra, no el crudo', () => {
    expect(nivelDeLluvia(0)).toBe('nula');
    expect(nivelDeLluvia(0.0949)).toBe('nula');
    expect(nivelDeLluvia(0.095)).toBe('baja');
    expect(nivelDeLluvia(0.2949)).toBe('baja');
    expect(nivelDeLluvia(0.295)).toBe('media');
    expect(nivelDeLluvia(0.5949)).toBe('media');
    // 59.6 % se muestra como 60 %: el nivel debe ser el mismo que el número en pantalla.
    expect(nivelDeLluvia(0.596)).toBe('alta');
    expect(nivelDeLluvia(0.595)).toBe('alta');
    expect(nivelDeLluvia(1)).toBe('alta');
  });

  test('los valores inválidos quedan en nula', () => {
    expect(nivelDeLluvia(Number.NaN)).toBe('nula');
    expect(nivelDeLluvia(-0.2)).toBe('nula');
    expect(nivelDeLluvia(1.7)).toBe('alta');
  });
});

describe('MENSAJE_ACCION', () => {
  test('tiene los cuatro textos exactos', () => {
    expect(MENSAJE_ACCION).toEqual({
      alta: 'Lleva paraguas.',
      media: 'Posible lluvia: ten un paraguas a la mano.',
      baja: 'Poco probable que llueva.',
      nula: 'No se espera lluvia.',
    });
  });
});

describe('NBSP', () => {
  test('es el espacio de no separación (U+00A0)', () => {
    expect(NBSP).toHaveLength(1);
    expect(NBSP.codePointAt(0)).toBe(0xa0);
  });
});
