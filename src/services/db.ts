const DB_NOMBRE = 'sistemaclima';
const DB_VERSION = 2;

export const STORE_CACHE = 'cache';
export const STORE_PREDICCIONES = 'predicciones';
export const STORE_OBSERVACIONES = 'observaciones';

export function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(DB_NOMBRE, DB_VERSION);
    peticion.onupgradeneeded = () => {
      const db = peticion.result;
      // La versión 1 solo tenía la caché; las bases existentes reciben los stores nuevos.
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: 'clave' });
      }
      for (const nombre of [STORE_PREDICCIONES, STORE_OBSERVACIONES]) {
        if (!db.objectStoreNames.contains(nombre)) {
          db.createObjectStore(nombre, { keyPath: 'id' });
        }
      }
    };
    peticion.onsuccess = () => {
      const db = peticion.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    peticion.onerror = () => reject(peticion.error ?? new Error('No se pudo abrir IndexedDB'));
  });
}
