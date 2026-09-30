import { config } from '../config';
import type { FuenteObservacion, Observacion, Prediccion } from '../domain/types';
import { abrirDb, STORE_OBSERVACIONES, STORE_PREDICCIONES } from './db';

/** Tope de registros que acepta una importación, para que un archivo corrupto no rebase la cuota. */
const MAX_REGISTROS_IMPORTACION = 200_000;

const MS_DIA = 86_400_000;

async function conDb<T>(operacion: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await abrirDb();
  try {
    return await operacion(db);
  } finally {
    db.close();
  }
}

function esperarTx(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Transacción de IndexedDB abortada'));
  });
}

/**
 * Inserta solo los ids nuevos dentro de una transacción ya abierta. `add` levanta
 * ConstraintError si el id existe; al cancelar el evento la transacción sigue y el registro
 * previo se conserva: la primera emisión gana.
 */
function agregarSinSobrescribir<T extends { id: string }>(
  tx: IDBTransaction,
  store: string,
  lista: T[],
): { contar: () => number } {
  let agregados = 0;
  for (const registro of lista) {
    const peticion = tx.objectStore(store).add(registro);
    peticion.onsuccess = () => {
      agregados += 1;
    };
    peticion.onerror = (evento) => {
      if (peticion.error?.name === 'ConstraintError') {
        evento.preventDefault();
      }
    };
  }
  return { contar: () => agregados };
}

export async function guardarPredicciones(lista: Prediccion[]): Promise<number> {
  if (lista.length === 0) {
    return 0;
  }
  return conDb(async (db) => {
    const tx = db.transaction(STORE_PREDICCIONES, 'readwrite');
    const conteo = agregarSinSobrescribir(tx, STORE_PREDICCIONES, lista);
    await esperarTx(tx);
    return conteo.contar();
  });
}

export async function guardarObservaciones(lista: Observacion[]): Promise<number> {
  if (lista.length === 0) {
    return 0;
  }
  return conDb(async (db) => {
    const tx = db.transaction(STORE_OBSERVACIONES, 'readwrite');
    const conteo = agregarSinSobrescribir(tx, STORE_OBSERVACIONES, lista);
    await esperarTx(tx);
    return conteo.contar();
  });
}

function leerTodos<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const peticion = db.transaction(store, 'readonly').objectStore(store).getAll();
    peticion.onsuccess = () => resolve(peticion.result as T[]);
    peticion.onerror = () => reject(peticion.error ?? new Error('Error al leer IndexedDB'));
  });
}

export function leerPredicciones(): Promise<Prediccion[]> {
  return conDb((db) => leerTodos(db, STORE_PREDICCIONES));
}

export function leerObservaciones(): Promise<Observacion[]> {
  return conDb((db) => leerTodos(db, STORE_OBSERVACIONES));
}

/** Borra lo más viejo que `retencionDias` y devuelve cuántos registros se purgaron. */
export async function purgarAntiguos(ahoraMs: number): Promise<number> {
  const limiteMs = ahoraMs - config.verificacion.retencionDias * MS_DIA;
  return conDb(async (db) => {
    const tx = db.transaction([STORE_PREDICCIONES, STORE_OBSERVACIONES], 'readwrite');
    let borrados = 0;
    const purgar = <T,>(store: string, instanteDe: (registro: T) => number) => {
      const peticion = tx.objectStore(store).openCursor();
      peticion.onsuccess = () => {
        const cursor = peticion.result;
        if (!cursor) {
          return;
        }
        if (instanteDe(cursor.value as T) < limiteMs) {
          cursor.delete();
          borrados += 1;
        }
        cursor.continue();
      };
    };
    purgar<Prediccion>(STORE_PREDICCIONES, (p) => p.finMs);
    purgar<Observacion>(STORE_OBSERVACIONES, (o) => o.tMs);
    await esperarTx(tx);
    return borrados;
  });
}

export async function borrarHistorial(): Promise<void> {
  return conDb(async (db) => {
    const tx = db.transaction([STORE_PREDICCIONES, STORE_OBSERVACIONES], 'readwrite');
    tx.objectStore(STORE_PREDICCIONES).clear();
    tx.objectStore(STORE_OBSERVACIONES).clear();
    await esperarTx(tx);
  });
}

export interface HistorialVerificacion {
  formato: 'sistemaclima-verificacion';
  version: 1;
  exportadoMs: number;
  predicciones: Prediccion[];
  observaciones: Observacion[];
}

export async function exportarHistorial(ahoraMs: number): Promise<HistorialVerificacion> {
  return {
    formato: 'sistemaclima-verificacion',
    version: 1,
    exportadoMs: ahoraMs,
    predicciones: await leerPredicciones(),
    observaciones: await leerObservaciones(),
  };
}

const esNumeroFinito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const enRango01 = (v: unknown): v is number => esNumeroFinito(v) && v >= 0 && v <= 1;
const esCadenaNoVacia = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

function validarPrediccion(valor: unknown, indice: number): Prediccion {
  const donde = `la predicción #${indice + 1}`;
  if (typeof valor !== 'object' || valor === null) {
    throw new Error(`El historial es inválido: ${donde} no es un objeto.`);
  }
  const p = valor as Record<string, unknown>;
  if (!esCadenaNoVacia(p.id) || !esCadenaNoVacia(p.celda)) {
    throw new Error(`El historial es inválido: ${donde} no tiene id o celda.`);
  }
  if (!esNumeroFinito(p.finMs) || !esNumeroFinito(p.emitidoMs)) {
    throw new Error(`El historial es inválido: ${donde} tiene fechas que no son números finitos.`);
  }
  if (!(config.verificacion.horizontesH as readonly number[]).includes(p.horizonteH as number)) {
    throw new Error(`El historial es inválido: ${donde} tiene un horizonte desconocido.`);
  }
  if (!enRango01(p.pop) || !enRango01(p.popEnsamble) || !enRango01(p.pesoRadar)) {
    throw new Error(`El historial es inválido: ${donde} tiene una probabilidad fuera del rango 0–1.`);
  }
  return {
    id: p.id,
    celda: p.celda,
    finMs: p.finMs,
    emitidoMs: p.emitidoMs,
    horizonteH: p.horizonteH as number,
    pop: p.pop,
    popEnsamble: p.popEnsamble,
    pesoRadar: p.pesoRadar,
  };
}

function validarObservacion(valor: unknown, indice: number): Observacion {
  const donde = `la observación #${indice + 1}`;
  if (typeof valor !== 'object' || valor === null) {
    throw new Error(`El historial es inválido: ${donde} no es un objeto.`);
  }
  const o = valor as Record<string, unknown>;
  if (!esCadenaNoVacia(o.id) || !esCadenaNoVacia(o.celda)) {
    throw new Error(`El historial es inválido: ${donde} no tiene id o celda.`);
  }
  if (!esNumeroFinito(o.tMs)) {
    throw new Error(`El historial es inválido: ${donde} tiene una fecha que no es un número finito.`);
  }
  if (typeof o.lluvia !== 'boolean') {
    throw new Error(`El historial es inválido: ${donde} no dice si llovía (true/false).`);
  }
  if (o.fuente !== 'radar' && o.fuente !== 'usuario') {
    throw new Error(`El historial es inválido: ${donde} tiene una fuente desconocida.`);
  }
  return {
    id: o.id,
    celda: o.celda,
    tMs: o.tMs,
    lluvia: o.lluvia,
    fuente: o.fuente as FuenteObservacion,
  };
}

export function validarHistorial(datos: unknown): { predicciones: Prediccion[]; observaciones: Observacion[] } {
  let crudo: unknown = datos;
  if (typeof datos === 'string') {
    try {
      crudo = JSON.parse(datos);
    } catch {
      throw new Error('El archivo no es JSON válido.');
    }
  }
  if (typeof crudo !== 'object' || crudo === null) {
    throw new Error('El archivo no contiene un historial de verificación.');
  }
  const h = crudo as Record<string, unknown>;
  if (h.formato !== 'sistemaclima-verificacion' || h.version !== 1) {
    throw new Error('El archivo no es un historial de SistemaClima (formato o versión desconocida).');
  }
  if (!esNumeroFinito(h.exportadoMs)) {
    throw new Error('El historial es inválido: la fecha de exportación no es un número finito.');
  }
  if (!Array.isArray(h.predicciones) || !Array.isArray(h.observaciones)) {
    throw new Error('El historial es inválido: faltan las listas de predicciones u observaciones.');
  }
  if (h.predicciones.length + h.observaciones.length > MAX_REGISTROS_IMPORTACION) {
    throw new Error('El historial es demasiado grande para importarlo.');
  }
  return {
    predicciones: Array.from(h.predicciones, validarPrediccion),
    observaciones: Array.from(h.observaciones, validarObservacion),
  };
}

/**
 * Mezcla un historial importado con el existente. Se valida TODO antes de escribir, así que un
 * archivo inválido no deja escrituras parciales. Predicciones: la primera emisión de cada id
 * gana; observaciones: unión por id. Devuelve cuántos registros nuevos entraron de cada tipo.
 */
export async function importarHistorial(
  datos: unknown,
): Promise<{ predicciones: number; observaciones: number }> {
  const historial = validarHistorial(datos);
  return conDb(async (db) => {
    const tx = db.transaction([STORE_PREDICCIONES, STORE_OBSERVACIONES], 'readwrite');
    const conteoPredicciones = agregarSinSobrescribir(tx, STORE_PREDICCIONES, historial.predicciones);
    const conteoObservaciones = agregarSinSobrescribir(tx, STORE_OBSERVACIONES, historial.observaciones);
    await esperarTx(tx);
    return { predicciones: conteoPredicciones.contar(), observaciones: conteoObservaciones.contar() };
  });
}
