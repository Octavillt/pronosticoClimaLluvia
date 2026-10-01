// Service worker del app shell de SistemaClima. Generado por vite/pwa.ts en cada build:
// no editar a mano; la versión y la lista de precaché se sustituyen al generar dist/sw.js.
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;

const NOMBRE_CACHE = `sistemaclima-shell-${VERSION}`;
const INDICE = new URL('./index.html', self.location.href).href;
const RAIZ = new URL('./', self.location.href).pathname;
const RUTA_INDICE = new URL(INDICE).pathname;
const URLS_PRECACHADAS = new Set(
  PRECACHE.map((ruta) => {
    const url = new URL(ruta, self.location.href);
    return url.origin + url.pathname;
  })
);

// Solo se lee el caché propio: uno viejo u otro del mismo origen podría tener entradas
// con la misma URL pero contenidos de otro despliegue.
const enPropioCache = (clave) =>
  caches.open(NOMBRE_CACHE).then((cache) => cache.match(clave));

self.addEventListener('install', (evento) => {
  // cache: 'reload' evita guardar copias viejas que el caché HTTP del hosting ya tuviera.
  evento.waitUntil(
    caches
      .open(NOMBRE_CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((ruta) => new Request(ruta, { cache: 'reload' }))))
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres
            .filter((nombre) => nombre.startsWith('sistemaclima-shell-') && nombre !== NOMBRE_CACHE)
            .map((nombre) => caches.delete(nombre))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (evento) => {
  if (evento.data && evento.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (evento) => {
  const request = evento.request;
  if (request.method !== 'GET') return;
  if (request.headers.has('Range')) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return;

  // Navegación: el shell solo cubre la raíz del scope y su index.html; la query no importa.
  // Cualquier otra ruta (otras páginas del dominio, 404 reales) sigue hacia el servidor.
  if (request.mode === 'navigate') {
    if (url.pathname !== RAIZ && url.pathname !== RUTA_INDICE) return;
    evento.respondWith(enPropioCache(INDICE).then((respuesta) => respuesta || fetch(request)));
    return;
  }

  // Solo se sirve del caché lo que el build precacheó; todo lo demás va directo a la red.
  const clave = url.origin + url.pathname;
  if (URLS_PRECACHADAS.has(clave)) {
    evento.respondWith(enPropioCache(clave).then((respuesta) => respuesta || fetch(request)));
  }
});
