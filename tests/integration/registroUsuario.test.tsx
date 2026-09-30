import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  borrarHistorial,
  guardarObservaciones,
  leerObservaciones,
} from '../../src/services/almacenVerificacion';
import { observacionDeUsuario } from '../../src/services/registroVerificacion';
import { geohashEncode } from '../../src/services/geohash';
import { useVerificacion } from '../../src/ui/useVerificacion';
import { PUNTO_VERIFICACION } from '../helpers/verificacion';

const entrada = {
  punto: PUNTO_VERIFICACION,
  resultado: null,
  mezcla: null,
  nowcast: null,
  ahoraMs: Date.now(),
};

beforeEach(async () => { await borrarHistorial(); });
afterEach(() => vi.restoreAllMocks());

test('devuelve false antes de cargar, true al escribir y false para un id duplicado', async () => {
  const { result } = renderHook(() => useVerificacion(entrada));
  expect(await result.current.registrarObservacionUsuario(true)).toBe(false);
  await waitFor(() => expect(result.current.resumen).not.toBeNull());
  const tMs = Date.now();
  let guardado: boolean | undefined;
  await act(async () => {
    guardado = await result.current.registrarObservacionUsuario(true, tMs);
  });
  expect(guardado).toBe(true);
  expect(await result.current.registrarObservacionUsuario(false, tMs)).toBe(false);
  const lista = await leerObservaciones();
  expect(lista).toHaveLength(1);
  expect(lista[0].lluvia).toBe(true);
});

test('sin celda devuelve false y no escribe observaciones', async () => {
  const { result } = renderHook(() => useVerificacion({ ...entrada, punto: null }));
  await waitFor(() => expect(result.current.resumen).not.toBeNull());
  expect(await result.current.registrarObservacionUsuario(true)).toBe(false);
  expect(await leerObservaciones()).toEqual([]);
});

test('un id ya guardado por otra pestaña devuelve false', async () => {
  const { result } = renderHook(() => useVerificacion(entrada));
  await waitFor(() => expect(result.current.resumen).not.toBeNull());
  const tMs = Date.now();
  const celda = geohashEncode(PUNTO_VERIFICACION.lat, PUNTO_VERIFICACION.lon);
  await guardarObservaciones([observacionDeUsuario(celda, false, tMs)]);
  expect(await result.current.registrarObservacionUsuario(true, tMs)).toBe(false);
  const lista = await leerObservaciones();
  expect(lista).toHaveLength(1);
  expect(lista[0].lluvia).toBe(false);
});

test('un fallo de IndexedDB devuelve false y degrada el registro', async () => {
  const { result } = renderHook(() => useVerificacion(entrada));
  await waitFor(() => expect(result.current.resumen).not.toBeNull());
  vi.spyOn(indexedDB, 'open').mockImplementation(() => {
    throw new DOMException('Sin cuota', 'QuotaExceededError');
  });
  let guardado: boolean | undefined;
  await act(async () => {
    guardado = await result.current.registrarObservacionUsuario(true);
  });
  expect(guardado).toBe(false);
  expect(result.current.disponible).toBe(false);
});
