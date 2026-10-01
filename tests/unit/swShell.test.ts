import { runInNewContext } from 'node:vm';
import { describe, expect, test, vi } from 'vitest';
import { renderizarServiceWorker } from '../../vite/pwa';

const BASE = 'https://ejemplo.test/app/sw.js';
const NOMBRE_CACHE = 'sistemaclima-shell-prueba';

class CabecerasDoble {
  private valores = new Map<string, string>();

  constructor(inicial: Record<string, string> = {}) {
    for (const [nombre, valor] of Object.entries(inicial)) {
      this.valores.set(nombre.toLowerCase(), valor);
    }
  }

  has(nombre: string) {
    return this.valores.has(nombre.toLowerCase());
  }
}

class RequestDoble {
  readonly url: string;
  readonly method: string;
  readonly mode: string;
  readonly cache: string;
  readonly headers: CabecerasDoble;

  constructor(
    url: string,
    init: { method?: string; mode?: string; cache?: string; headers?: Record<string, string> } = {}
  ) {
    // En un service worker real las URLs relativas se resuelven contra self.location.
    this.url = new URL(url, BASE).href;
    this.method = init.method ?? 'GET';
    this.mode = init.mode ?? 'cors';
    this.cache = init.cache ?? 'default';
    this.headers = new CabecerasDoble(init.headers);
  }
}

class ResponseDoble {
  constructor(readonly cuerpo: string) {}
}

type Manejador = (evento: any) => void;

function crearEntorno(precache: string[]) {
  const oyentes = new Map<string, Manejador[]>();
  const almacen = new Map<string, Map<string, ResponseDoble>>();
  const addAll = vi.fn(async (peticiones: RequestDoble[]) => {
    for (const peticion of peticiones) {
      almacen.get(NOMBRE_CACHE)!.set(peticion.url, new ResponseDoble('precacheado'));
    }
  });
  const fetchDoble = vi.fn(async (_peticion: unknown) => new ResponseDoble('desde-red'));

  const self = {
    location: { href: BASE, origin: 'https://ejemplo.test' },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
    addEventListener: (tipo: string, cb: Manejador) => {
      if (!oyentes.has(tipo)) oyentes.set(tipo, []);
      oyentes.get(tipo)!.push(cb);
    },
  };

  const caches = {
    open: async (nombre: string) => {
      if (!almacen.has(nombre)) almacen.set(nombre, new Map());
      // El service worker solo debe leer su propio caché, nunca el match global.
      return { addAll, match: async (clave: string) => almacen.get(nombre)!.get(clave) };
    },
    keys: async () => [...almacen.keys()],
    delete: async (nombre: string) => almacen.delete(nombre),
    match: async () => {
      throw new Error('caches.match global no debe usarse');
    },
  };

  const codigo = renderizarServiceWorker(precache, 'prueba');
  runInNewContext(codigo, {
    self,
    caches,
    Request: RequestDoble,
    Response: ResponseDoble,
    URL,
    fetch: fetchDoble,
  });

  const disparar = (tipo: string, evento: unknown) => {
    for (const cb of oyentes.get(tipo) ?? []) cb(evento);
  };

  async function instalar() {
    let espera: Promise<unknown> | undefined;
    disparar('install', { waitUntil: (p: Promise<unknown>) => (espera = p) });
    await espera;
  }

  async function activar() {
    let espera: Promise<unknown> | undefined;
    disparar('activate', { waitUntil: (p: Promise<unknown>) => (espera = p) });
    await espera;
  }

  async function interceptar(request: RequestDoble) {
    let respondida: Promise<ResponseDoble> | undefined;
    const respondWith = vi.fn((p: Promise<ResponseDoble>) => (respondida = p));
    disparar('fetch', { request, respondWith });
    return { respondWith, respuesta: respondida ? await respondida : undefined };
  }

  return { self, almacen, addAll, fetchDoble, disparar, instalar, activar, interceptar };
}

describe('service worker del shell', () => {
  test('install precachea con cache reload, no salta y guarda las URLs resueltas', async () => {
    const entorno = crearEntorno(['./index.html', './assets/app-abc.js']);
    await entorno.instalar();

    expect(entorno.addAll).toHaveBeenCalledOnce();
    const peticiones = entorno.addAll.mock.calls[0][0];
    expect(peticiones.map((p: RequestDoble) => p.url)).toEqual([
      'https://ejemplo.test/app/index.html',
      'https://ejemplo.test/app/assets/app-abc.js',
    ]);
    expect(peticiones.every((p: RequestDoble) => p.cache === 'reload')).toBe(true);
    expect(entorno.self.skipWaiting).not.toHaveBeenCalled();
    expect(entorno.almacen.get(NOMBRE_CACHE)!.has('https://ejemplo.test/app/index.html')).toBe(true);
  });

  test('install falla si addAll falla y la versión anterior sigue mandando', async () => {
    const entorno = crearEntorno(['./index.html']);
    entorno.addAll.mockRejectedValue(new Error('red caida'));
    await expect(entorno.instalar()).rejects.toThrow('red caida');
    expect(entorno.self.skipWaiting).not.toHaveBeenCalled();
  });

  test('activate borra solo cachés propios viejos y hace clients.claim', async () => {
    const entorno = crearEntorno(['./index.html']);
    entorno.almacen.set('sistemaclima-shell-vieja', new Map());
    entorno.almacen.set('otra-app-v1', new Map());
    entorno.almacen.set(NOMBRE_CACHE, new Map());

    await entorno.activar();

    expect(entorno.almacen.has('sistemaclima-shell-vieja')).toBe(false);
    expect(entorno.almacen.has(NOMBRE_CACHE)).toBe(true);
    expect(entorno.almacen.has('otra-app-v1')).toBe(true);
    expect(entorno.self.clients.claim).toHaveBeenCalledOnce();
  });

  test('el mensaje SKIP_WAITING salta la espera; otros mensajes no', () => {
    const entorno = crearEntorno(['./index.html']);
    entorno.disparar('message', { data: { type: 'OTRO' } });
    expect(entorno.self.skipWaiting).not.toHaveBeenCalled();
    entorno.disparar('message', { data: { type: 'SKIP_WAITING' } });
    expect(entorno.self.skipWaiting).toHaveBeenCalledOnce();
  });

  test('no intercepta POST, otro origen, sw.js ni peticiones Range', async () => {
    const entorno = crearEntorno(['./index.html']);
    const peticiones = [
      new RequestDoble('https://ejemplo.test/app/datos', { method: 'POST' }),
      new RequestDoble('https://api.open-meteo.com/pronostico'),
      new RequestDoble('https://ejemplo.test/app/sw.js'),
      new RequestDoble('https://ejemplo.test/app/assets/app-abc.js', {
        headers: { Range: 'bytes=0-99' },
      }),
    ];
    for (const peticion of peticiones) {
      const { respondWith, respuesta } = await entorno.interceptar(peticion);
      expect(respondWith).not.toHaveBeenCalled();
      expect(respuesta).toBeUndefined();
    }
    expect(entorno.fetchDoble).not.toHaveBeenCalled();
  });

  test('navegación sirve el index cacheado aunque la URL lleve query string', async () => {
    const entorno = crearEntorno(['./index.html']);
    const cacheado = new ResponseDoble('index-cacheado');
    entorno.almacen.set(NOMBRE_CACHE, new Map([['https://ejemplo.test/app/index.html', cacheado]]));

    const navegacion = new RequestDoble('https://ejemplo.test/app/?ciudad=cdmx', {
      mode: 'navigate',
    });
    const { respuesta } = await entorno.interceptar(navegacion);

    expect(respuesta).toBe(cacheado);
    expect(entorno.fetchDoble).not.toHaveBeenCalled();
  });

  test('solo sirve del caché propio aunque otro tenga la misma URL', async () => {
    const entorno = crearEntorno(['./index.html', './assets/app-abc.js']);
    entorno.almacen.set('sistemaclima-shell-viejo', new Map([
      ['https://ejemplo.test/app/index.html', new ResponseDoble('del-viejo')],
    ]));
    entorno.almacen.set('otra-app-v1', new Map([
      ['https://ejemplo.test/app/index.html', new ResponseDoble('foraneo')],
    ]));
    entorno.almacen.set(NOMBRE_CACHE, new Map([
      ['https://ejemplo.test/app/index.html', new ResponseDoble('propio')],
    ]));

    const navegacion = new RequestDoble('https://ejemplo.test/app/', { mode: 'navigate' });
    const { respuesta } = await entorno.interceptar(navegacion);
    expect(respuesta?.cuerpo).toBe('propio');

    const asset = new RequestDoble('https://ejemplo.test/app/assets/app-abc.js');
    entorno.almacen.get(NOMBRE_CACHE)!.set(
      'https://ejemplo.test/app/assets/app-abc.js',
      new ResponseDoble('asset-propio')
    );
    entorno.almacen.get('sistemaclima-shell-viejo')!.set(
      'https://ejemplo.test/app/assets/app-abc.js',
      new ResponseDoble('asset-viejo')
    );
    const { respuesta: respuestaAsset } = await entorno.interceptar(asset);
    expect(respuestaAsset?.cuerpo).toBe('asset-propio');
  });

  test('intercepta solo la raíz del scope y su index.html en navegaciones', async () => {
    const entorno = crearEntorno(['./index.html']);
    entorno.almacen.set(NOMBRE_CACHE, new Map([
      ['https://ejemplo.test/app/index.html', new ResponseDoble('index-cacheado')],
    ]));

    const interceptadas = [
      'https://ejemplo.test/app/',
      'https://ejemplo.test/app/?q=1',
      'https://ejemplo.test/app/index.html',
    ];
    for (const url of interceptadas) {
      const { respondWith, respuesta } = await entorno.interceptar(
        new RequestDoble(url, { mode: 'navigate' })
      );
      expect(respondWith).toHaveBeenCalledOnce();
      expect(respuesta?.cuerpo).toBe('index-cacheado');
    }

    const libres = [
      'https://ejemplo.test/app/otra-pagina',
      'https://ejemplo.test/app/404.html',
    ];
    for (const url of libres) {
      const { respondWith, respuesta } = await entorno.interceptar(
        new RequestDoble(url, { mode: 'navigate' })
      );
      expect(respondWith).not.toHaveBeenCalled();
      expect(respuesta).toBeUndefined();
    }
    expect(entorno.fetchDoble).not.toHaveBeenCalled();
  });

  test('navegación cae a la red si no hay caché', async () => {
    const entorno = crearEntorno(['./index.html']);
    const { respuesta } = await entorno.interceptar(
      new RequestDoble('https://ejemplo.test/app/', { mode: 'navigate' })
    );
    expect(respuesta?.cuerpo).toBe('desde-red');
    expect(entorno.fetchDoble).toHaveBeenCalledOnce();
  });

  test('un archivo precacheado se sirve del caché', async () => {
    const entorno = crearEntorno(['./index.html', './assets/app-abc.js']);
    await entorno.instalar();

    const { respuesta } = await entorno.interceptar(
      new RequestDoble('https://ejemplo.test/app/assets/app-abc.js')
    );

    expect(respuesta?.cuerpo).toBe('precacheado');
    expect(entorno.fetchDoble).not.toHaveBeenCalled();
  });

  test('un archivo no precacheado no se intercepta: va a la red y no se guarda', async () => {
    const entorno = crearEntorno(['./index.html']);
    const { respondWith, respuesta } = await entorno.interceptar(
      new RequestDoble('https://ejemplo.test/app/datos/externo.json')
    );

    expect(respondWith).not.toHaveBeenCalled();
    expect(respuesta).toBeUndefined();
    expect(entorno.almacen.size).toBe(0);
  });
});
