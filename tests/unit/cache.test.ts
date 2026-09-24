import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import { guardarCache, leerCache, limpiarExpirados } from '../../src/services/cache';

describe('cache IndexedDB', () => {
  beforeEach(async () => {
    await limpiarExpirados(Number.MAX_SAFE_INTEGER);
  });

  test('devuelve null cuando la clave no existe', async () => {
    expect(await leerCache('inexistente')).toBeNull();
  });

  test('guarda y lee un valor dentro del TTL', async () => {
    await guardarCache('clave', { pop: 0.5 }, 60_000);
    expect(await leerCache<{ pop: number }>('clave')).toEqual({ pop: 0.5 });
  });

  test('devuelve null cuando el valor expiró', async () => {
    await guardarCache('clave', 1, -1);
    expect(await leerCache('clave')).toBeNull();
  });

  test('limpiarExpirados borra solo los vencidos', async () => {
    await guardarCache('vigente', 1, 60_000);
    await guardarCache('vencida', 2, -1);
    const borradas = await limpiarExpirados();
    expect(borradas).toBe(1);
    expect(await leerCache('vigente')).toBe(1);
    expect(await leerCache('vencida')).toBeNull();
  });
});
