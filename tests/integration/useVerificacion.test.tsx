import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Nowcast, Observacion, Prediccion } from '../../src/domain/types';
import { borrarHistorial, leerObservaciones, leerPredicciones } from '../../src/services/almacenVerificacion';
import { geohashEncode } from '../../src/services/geohash';
import * as registro from '../../src/services/registroVerificacion';
import { useVerificacion, type EntradaVerificacion } from '../../src/ui/useVerificacion';
import { MS_HORA } from '../../src/utils/horas';

const PUNTO = { lat: 19.43, lon: -99.13 };
const CELDA = geohashEncode(PUNTO.lat, PUNTO.lon);

function entrada(ahoraMs = Date.now()): EntradaVerificacion {
  return { punto: PUNTO, resultado: null, mezcla: null, nowcast: null, ahoraMs };
}

function historialSesgado() {
  const base = Math.floor(Date.now() / MS_HORA) * MS_HORA;
  const predicciones: Prediccion[] = [];
  const observaciones: Observacion[] = [];
  for (let i = 1; i <= 150; i += 1) {
    const finMs = base - i * MS_HORA;
    predicciones.push({
      id: `${CELDA}|${finMs}|1`, celda: CELDA, finMs, emitidoMs: finMs - MS_HORA / 2,
      horizonteH: 1, pop: 0.8, popEnsamble: 0.8, pesoRadar: 0,
    });
    for (let v = 1; v <= 3; v += 1) {
      const tMs = finMs - v * 600_000;
      observaciones.push({ id: `${CELDA}|radar|${tMs}`, celda: CELDA, tMs, lluvia: false, fuente: 'radar' });
    }
  }
  return { formato: 'sistemaclima-verificacion', version: 1, exportadoMs: Date.now(), predicciones, observaciones };
}

describe('useVerificacion', () => {
  beforeEach(async () => { await borrarHistorial(); });
  afterEach(() => vi.restoreAllMocks());

  test('exportar, importar y borrar actualizan el historial, el resumen y la calibración', async () => {
    const { result } = renderHook(() => useVerificacion(entrada()));
    await waitFor(() => expect(result.current.resumen).not.toBeNull());
    let agregados: unknown;
    await act(async () => { agregados = await result.current.importar(historialSesgado()); });
    expect(agregados).toEqual({ predicciones: 150, observaciones: 450 });
    expect(result.current.calibracion[1].n).toBe(150);
    expect(result.current.resumen?.horasVerificadas).toBe(150);
    const json = await result.current.exportar();
    expect(JSON.parse(json).predicciones).toHaveLength(150);
    await act(async () => { await result.current.borrar(); });
    expect(result.current.calibracion).toEqual({});
    expect(result.current.resumen?.pares).toBe(0);
    expect(await leerPredicciones()).toEqual([]);
    await act(async () => { await result.current.importar(json); });
    expect(result.current.calibracion[1].n).toBe(150);
  });

  test('un archivo inválido no desactiva IndexedDB ni altera el ajuste', async () => {
    const { result } = renderHook(() => useVerificacion(entrada()));
    await waitFor(() => expect(result.current.resumen).not.toBeNull());
    await act(async () => { await result.current.importar(historialSesgado()); });
    await expect(result.current.importar('no es JSON')).rejects.toThrow(/JSON válido/);
    expect(result.current.disponible).toBe(true);
    expect(result.current.calibracion[1].n).toBe(150);
  });

  test('el reloj registra las bandas 6, 3 y 1 sin repetir escrituras por minuto ni reajustar', async () => {
    const finMs = Date.parse('2026-09-30T18:00:00Z');
    const inicial: EntradaVerificacion = {
      ...entrada(finMs - 5.5 * MS_HORA),
      resultado: {
        tipo: 'ok', punto: PUNTO, timezone: 'America/Mexico_City', horasUtc: [new Date(finMs).toISOString()],
        pop: [0.8], precipitacionMm: [0], temperaturaC: [20], codigoClima: [1],
        fuentes: { ensamble: 'ok', modelosFallidos: [], complemento: 'ok', cache: 'miss' },
      },
      mezcla: { pop: [0.6], popRadar: [0.4], pesoRadar: [0.5] },
    };
    const { result, rerender } = renderHook((props) => useVerificacion(props), { initialProps: inicial });
    await waitFor(async () => expect(await leerPredicciones()).toHaveLength(1));
    const apertura = vi.spyOn(indexedDB, 'open');
    const ajuste = vi.spyOn(registro, 'calibracionDesde');
    await act(async () => { rerender({ ...inicial, ahoraMs: inicial.ahoraMs + 60_000 }); });
    expect(apertura).not.toHaveBeenCalled();
    expect(ajuste).not.toHaveBeenCalled();
    rerender({ ...inicial, ahoraMs: finMs - 2.5 * MS_HORA });
    await waitFor(async () => expect(await leerPredicciones()).toHaveLength(2));
    rerender({ ...inicial, ahoraMs: finMs - 0.5 * MS_HORA });
    await waitFor(async () => expect(await leerPredicciones()).toHaveLength(3));
    const lista = await leerPredicciones();
    expect(lista.map((p) => p.horizonteH).sort((a, b) => a - b)).toEqual([1, 3, 6]);
    expect(lista.every((p) => p.pop === 0.6 && p.popEnsamble === 0.8 && p.celda === CELDA)).toBe(true);
    expect(lista.find((p) => p.horizonteH === 1)?.emitidoMs).toBe(finMs - 0.5 * MS_HORA);
    expect(result.current.disponible).toBe(true);
    expect(ajuste).not.toHaveBeenCalled();
  });

  test('registra radar y usuario en la misma celda y deduplica los frames', async () => {
    const finMs = Math.floor(Date.now() / MS_HORA) * MS_HORA;
    const nowcast: Nowcast = {
      tFrameMs: finMs, movimiento: { estado: 'sin-ecos' }, observados: [], pronostico: [], avance: null,
      puntual: [1, 2, 3].map((v) => ({ tMs: finMs - v * 600_000, dbz: -32 })),
    };
    const inicial = { ...entrada(), nowcast };
    const { result, rerender } = renderHook((props) => useVerificacion(props), { initialProps: inicial });
    await waitFor(() => expect(result.current.resumen?.horasVerificadas).toBe(1));
    expect(await leerObservaciones()).toHaveLength(3);
    const apertura = vi.spyOn(indexedDB, 'open');
    await act(async () => { rerender({ ...inicial, nowcast: { ...nowcast } }); });
    expect(apertura).not.toHaveBeenCalled();
    await act(async () => { await result.current.registrarObservacionUsuario(true, finMs - 600_000); });
    const lista = await leerObservaciones();
    expect(lista).toHaveLength(4);
    expect(lista.every((o) => o.celda === CELDA)).toBe(true);
    expect(lista.some((o) => o.fuente === 'usuario' && o.lluvia)).toBe(true);
    apertura.mockClear();
    await act(async () => { await result.current.registrarObservacionUsuario(true, finMs - 600_000); });
    expect(apertura).not.toHaveBeenCalled();
  });

  test('un fallo de escritura posterior al ajuste desactiva registro y calibración en silencio', async () => {
    const { result } = renderHook(() => useVerificacion(entrada()));
    await waitFor(() => expect(result.current.resumen).not.toBeNull());
    await act(async () => { await result.current.importar(historialSesgado()); });
    vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new DOMException('Sin cuota', 'QuotaExceededError'); });
    await act(async () => { await result.current.registrarObservacionUsuario(true); });
    expect(result.current.disponible).toBe(false);
    expect(result.current.calibracion).toEqual({});
    expect(result.current.resumen).toBeNull();
  });

  test('borrar no resucita los frames ni predicciones actuales, pero permite nuevos frames', async () => {
    const ahoraMs = Date.now();
    const finMs = Math.floor(ahoraMs / MS_HORA) * MS_HORA;
    const proximaHora = new Date(finMs + MS_HORA).toISOString();
    const nowcast: Nowcast = {
      tFrameMs: finMs - 600_000, movimiento: { estado: 'sin-ecos' }, observados: [], pronostico: [], avance: null,
      puntual: [1, 2, 3].map((v) => ({ tMs: finMs - v * 600_000, dbz: -32 })),
    };
    const inicial: EntradaVerificacion = {
      ...entrada(ahoraMs), nowcast,
      resultado: {
        tipo: 'ok', punto: PUNTO, timezone: 'America/Mexico_City', horasUtc: [proximaHora], pop: [0.8],
        precipitacionMm: [0], temperaturaC: [20], codigoClima: [1],
        fuentes: { ensamble: 'ok', modelosFallidos: [], complemento: 'ok', cache: 'miss' },
      },
      mezcla: { pop: [0.8], popRadar: [null], pesoRadar: [0] },
    };
    const { result, rerender } = renderHook((props) => useVerificacion(props), { initialProps: inicial });
    await waitFor(() => expect(result.current.resumen?.observaciones).toBe(3));
    await waitFor(async () => expect(await leerPredicciones()).toHaveLength(1));
    await act(async () => { await result.current.borrar(); });
    expect(result.current.resumen?.observaciones).toBe(0);
    expect(await leerObservaciones()).toEqual([]);
    expect(await leerPredicciones()).toEqual([]);
    rerender({ ...inicial, nowcast: { ...nowcast, tFrameMs: finMs, puntual: [...nowcast.puntual, { tMs: finMs, dbz: 35 }] } });
    await waitFor(() => expect(result.current.resumen?.observaciones).toBe(1));
    const lista = await leerObservaciones();
    expect(lista).toHaveLength(1);
    expect(lista[0].tMs).toBe(finMs);
  });
});
