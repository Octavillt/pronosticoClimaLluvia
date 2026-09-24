const DB_NOMBRE = 'sistemaclima';
const DB_VERSION = 1;
const STORE = 'cache';

interface RegistroCache<T> {
  clave: string;
  expiraEn: number;
  valor: T;
}

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(DB_NOMBRE, DB_VERSION);
    peticion.onupgradeneeded = () => {
      const db = peticion.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'clave' });
      }
    };
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error ?? new Error('No se pudo abrir IndexedDB'));
  });
}

function transaccion<T>(
  db: IDBDatabase,
  modo: IDBTransactionMode,
  operacion: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, modo);
    const peticion = operacion(tx.objectStore(STORE));
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error ?? new Error('Error en IndexedDB'));
    tx.onerror = () => reject(tx.error ?? new Error('Error en la transacción'));
  });
}

export async function leerCache<T>(clave: string, ahora: number = Date.now()): Promise<T | null> {
  const db = await abrirDb();
  const registro = await transaccion(db, 'readonly', (store) => store.get(clave));
  db.close();
  const entrada = registro as RegistroCache<T> | undefined;
  if (!entrada) {
    return null;
  }
  if (entrada.expiraEn <= ahora) {
    return null;
  }
  return entrada.valor;
}

export async function guardarCache<T>(clave: string, valor: T, ttlMs: number): Promise<void> {
  const db = await abrirDb();
  const registro: RegistroCache<T> = { clave, valor, expiraEn: Date.now() + ttlMs };
  await transaccion(db, 'readwrite', (store) => store.put(registro));
  db.close();
}

export async function limpiarExpirados(ahora: number = Date.now()): Promise<number> {
  const db = await abrirDb();
  const claves = await transaccion(db, 'readwrite', (store) => store.getAll());
  let borradas = 0;
  for (const registro of claves as RegistroCache<unknown>[]) {
    if (registro.expiraEn <= ahora) {
      await transaccion(db, 'readwrite', (store) => store.delete(registro.clave));
      borradas += 1;
    }
  }
  db.close();
  return borradas;
}
