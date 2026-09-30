import { beforeEach, describe, expect, test } from 'vitest';
import { config } from '../../src/config';
import type { Observacion, Prediccion } from '../../src/domain/types';
import {
  borrarHistorial,
  exportarHistorial,
  guardarObservaciones,
  guardarPredicciones,
  importarHistorial,
  leerObservaciones,
  leerPredicciones,
  purgarAntiguos,
} from '../../src/services/almacenVerificacion';
import { leerCache } from '../../src/services/cache';
import { abrirDb } from '../../src/services/db';
import { MS_HORA } from '../../src/utils/horas';

const AHORA = Date.parse('2026-09-30T18:30:00Z');
const DIA_MS = 86_400_000;

function prediccion(id: string, extra: Partial<Prediccion> = {}): Prediccion {
  return {
    id,
    celda: '9g3qh',
    finMs: AHORA - MS_HORA,
    emitidoMs: AHORA - 2 * MS_HORA,
    horizonteH: 1,
    pop: 0.5,
    popEnsamble: 0.4,
    pesoRadar: 0.1,
    ...extra,
  };
}

function observacion(id: string, extra: Partial<Observacion> = {}): Observacion {
  return { id, celda: '9g3qh', tMs: AHORA - 10 * 60_000, lluvia: true, fuente: 'radar', ...extra };
}

describe('almacenVerificacion', () => {
  beforeEach(async () => {
    await borrarHistorial();
  });

  test('la primera emisión de una predicción gana: no se sobrescribe', async () => {
    expect(await guardarPredicciones([prediccion('p1', { pop: 0.5 })])).toBe(1);
    expect(await guardarPredicciones([prediccion('p1', { pop: 0.9 })])).toBe(0);
    const lista = await leerPredicciones();
    expect(lista).toHaveLength(1);
    expect(lista[0].pop).toBe(0.5);
  });

  test('guardarPredicciones guarda todo en una transacción', async () => {
    const agregadas = await guardarPredicciones([
      prediccion('p1'),
      prediccion('p2'),
      prediccion('p1'), // duplicada dentro del mismo lote
    ]);
    expect(agregadas).toBe(2);
    expect(await leerPredicciones()).toHaveLength(2);
  });

  test('guardarObservaciones es idempotente por id', async () => {
    await guardarObservaciones([observacion('o1')]);
    expect(await guardarObservaciones([observacion('o1', { lluvia: false })])).toBe(0);
    const lista = await leerObservaciones();
    expect(lista).toHaveLength(1);
    expect(lista[0].lluvia).toBe(true);
  });

  test('purgarAntiguos borra lo más viejo que la retención configurada', async () => {
    const viejoMs = AHORA - (config.verificacion.retencionDias + 1) * DIA_MS;
    const recienteMs = AHORA - DIA_MS;
    await guardarPredicciones([
      prediccion('vieja', { finMs: viejoMs }),
      prediccion('reciente', { finMs: recienteMs }),
    ]);
    await guardarObservaciones([
      observacion('vieja', { tMs: viejoMs }),
      observacion('reciente', { tMs: recienteMs }),
    ]);
    expect(await purgarAntiguos(AHORA)).toBe(2);
    expect((await leerPredicciones()).map((p) => p.id)).toEqual(['reciente']);
    expect((await leerObservaciones()).map((o) => o.id)).toEqual(['reciente']);
  });

  test('exportar e importar hacen la ida y vuelta completa', async () => {
    await guardarPredicciones([prediccion('p1'), prediccion('p2', { pop: 0.8 })]);
    await guardarObservaciones([observacion('o1')]);
    const exportado = await exportarHistorial(AHORA);
    expect(exportado.formato).toBe('sistemaclima-verificacion');
    expect(exportado.version).toBe(1);
    expect(exportado.exportadoMs).toBe(AHORA);

    await borrarHistorial();
    const agregados = await importarHistorial(JSON.stringify(exportado));
    expect(agregados).toEqual({ predicciones: 2, observaciones: 1 });
    expect(await leerPredicciones()).toEqual(exportado.predicciones);
    expect(await leerObservaciones()).toEqual(exportado.observaciones);
  });

  test('importar mezcla con lo existente: primera emisión gana y observaciones se unen', async () => {
    await guardarPredicciones([prediccion('p1', { pop: 0.5 })]);
    await guardarObservaciones([observacion('o1')]);
    const agregados = await importarHistorial({
      formato: 'sistemaclima-verificacion',
      version: 1,
      exportadoMs: AHORA,
      predicciones: [prediccion('p1', { pop: 0.9 }), prediccion('p2')],
      observaciones: [observacion('o1', { lluvia: false }), observacion('o2')],
    });
    expect(agregados).toEqual({ predicciones: 1, observaciones: 1 });
    const predicciones = await leerPredicciones();
    expect(predicciones).toHaveLength(2);
    expect(predicciones.find((p) => p.id === 'p1')!.pop).toBe(0.5);
    expect(await leerObservaciones()).toHaveLength(2);
  });

  describe('importación inválida', () => {
    const casos: [string, unknown, RegExp][] = [
      ['texto que no es JSON', 'esto no es json', /JSON válido/],
      ['formato desconocido', { formato: 'otro', version: 1, predicciones: [], observaciones: [] }, /formato o versión/],
      ['versión desconocida', { formato: 'sistemaclima-verificacion', version: 2, predicciones: [], observaciones: [] }, /formato o versión/],
      ['sin listas', { formato: 'sistemaclima-verificacion', version: 1, exportadoMs: AHORA }, /predicciones u observaciones/],
      ['fecha de exportación no finita', { formato: 'sistemaclima-verificacion', version: 1, exportadoMs: Infinity, predicciones: [], observaciones: [] }, /fecha de exportación/],
    ];

    test.each(casos)('%s se rechaza sin escribir nada', async (_nombre, datos, mensaje) => {
      await guardarPredicciones([prediccion('previa')]);
      await expect(importarHistorial(datos)).rejects.toThrow(mensaje);
      expect((await leerPredicciones()).map((p) => p.id)).toEqual(['previa']);
    });

    test('una predicción con pop fuera de 0–1 se rechaza sin escrituras parciales', async () => {
      const datos = {
        formato: 'sistemaclima-verificacion',
        version: 1,
        exportadoMs: AHORA,
        predicciones: [prediccion('buena'), prediccion('mala', { pop: 1.5 })],
        observaciones: [],
      };
      await expect(importarHistorial(datos)).rejects.toThrow(/rango 0–1/);
      expect(await leerPredicciones()).toEqual([]);
    });

    test.each([
      ['horizonte desconocido', prediccion('x', { horizonteH: 7 }), /horizonte/],
      ['fecha no finita', prediccion('x', { finMs: NaN }), /fechas/],
      ['id vacío', prediccion(''), /id o celda/],
    ])('predicción con %s se rechaza', async (_nombre, mala, mensaje) => {
      const datos = {
        formato: 'sistemaclima-verificacion',
        version: 1,
        exportadoMs: AHORA,
        predicciones: [mala],
        observaciones: [],
      };
      await expect(importarHistorial(datos)).rejects.toThrow(mensaje);
      expect(await leerPredicciones()).toEqual([]);
    });

    test.each([
      ['fuente desconocida', { ...observacion('x'), fuente: 'satelite' }, /fuente/],
      ['lluvia que no es booleana', { ...observacion('x'), lluvia: 'sí' }, /llovía/],
      ['id vacío', observacion(''), /id o celda/],
    ])('observación con %s se rechaza', async (_nombre, mala, mensaje) => {
      const datos = {
        formato: 'sistemaclima-verificacion',
        version: 1,
        exportadoMs: AHORA,
        predicciones: [],
        observaciones: [mala],
      };
      await expect(importarHistorial(datos)).rejects.toThrow(mensaje);
      expect(await leerObservaciones()).toEqual([]);
    });

    test('un historial gigante se rechaza', async () => {
      const datos = {
        formato: 'sistemaclima-verificacion',
        version: 1,
        exportadoMs: AHORA,
        predicciones: [],
        observaciones: Array.from({ length: 200_001 }, (_, i) => observacion(`o${i}`)),
      };
      await expect(importarHistorial(datos)).rejects.toThrow(/demasiado grande/);
      expect(await leerObservaciones()).toEqual([]);
    });
  });

  test('una base de la versión 1 (solo caché) migra a la 2 conservando sus datos', async () => {
    // Recrea la base como quedó en la Fase 1: versión 1 con el solo store de caché.
    await new Promise<void>((resolve, reject) => {
      const peticion = indexedDB.deleteDatabase('sistemaclima');
      peticion.onsuccess = () => resolve();
      peticion.onerror = () => reject(peticion.error);
      peticion.onblocked = () => reject(new Error('la base quedó bloqueada por otra conexión'));
    });
    await new Promise<void>((resolve, reject) => {
      const peticion = indexedDB.open('sistemaclima', 1);
      peticion.onupgradeneeded = () => {
        peticion.result
          .createObjectStore('cache', { keyPath: 'clave' })
          .put({ clave: 'vieja', valor: { pop: 0.3 }, expiraEn: Number.MAX_SAFE_INTEGER });
      };
      peticion.onsuccess = () => {
        peticion.result.close();
        resolve();
      };
      peticion.onerror = () => reject(peticion.error);
    });

    const db = await abrirDb();
    expect(db.version).toBe(2);
    db.close();

    // La caché vieja sigue legible y los stores nuevos ya existen vacíos.
    expect(await leerCache<{ pop: number }>('vieja')).toEqual({ pop: 0.3 });
    expect(await leerPredicciones()).toEqual([]);
    expect(await leerObservaciones()).toEqual([]);
  });
});
