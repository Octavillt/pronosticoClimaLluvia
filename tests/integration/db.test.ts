import { expect, test, vi } from 'vitest';
import { abrirDb } from '../../src/services/db';

test('una conexión abierta se cierra al pedir otra pestaña una versión mayor', async () => {
  const db = await abrirDb();
  const cerrar = vi.spyOn(db, 'close');
  const bloqueado = vi.fn();
  let nueva: IDBDatabase | undefined;
  try {
    nueva = await new Promise<IDBDatabase>((resolve, reject) => {
      const peticion = indexedDB.open('sistemaclima', db.version + 1);
      peticion.onblocked = bloqueado;
      peticion.onerror = () => reject(peticion.error);
      peticion.onsuccess = () => resolve(peticion.result);
    });
    expect(cerrar).toHaveBeenCalledOnce();
    expect(bloqueado).not.toHaveBeenCalled();
    expect(nueva.version).toBe(db.version + 1);
    expect(() => db.transaction('cache')).toThrow();
  } finally {
    nueva?.close();
    db.close();
    vi.restoreAllMocks();
  }
});
