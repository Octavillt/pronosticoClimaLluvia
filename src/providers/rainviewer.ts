import { config } from '../config';
import type { FrameRadar, IndiceRadar, TileRgba } from '../domain/types';
import { fetchBlob, fetchJson } from './http';

/** Solo se aceptan hosts de RainViewer: el JSON es de un tercero y con él se arman URLs. */
const HOST_PERMITIDO = /^https:\/\/([a-z0-9-]+\.)*rainviewer\.com$/;
const RUTA_PERMITIDA = /^\/v2\/radar\/[A-Za-z0-9_-]+$/;

/**
 * Esquema 2 (Universal Blue). La API pública hoy ignora este valor y sirve siempre esa paleta,
 * pero declararlo evita que un cambio futuro rompa la decodificación de `radarDecode`.
 */
const ESQUEMA_COLOR = 2;

export function parseIndiceRadar(json: unknown): IndiceRadar {
  if (typeof json !== 'object' || json === null) {
    throw new Error('Índice de radar inválido: no es un objeto');
  }
  const raiz = json as Record<string, unknown>;
  if (typeof raiz.host !== 'string' || !HOST_PERMITIDO.test(raiz.host)) {
    throw new Error('Índice de radar inválido: host no permitido');
  }
  const radar = raiz.radar;
  const pasados = typeof radar === 'object' && radar !== null ? (radar as Record<string, unknown>).past : undefined;
  if (!Array.isArray(pasados)) {
    throw new Error('Índice de radar inválido: falta "radar.past"');
  }

  const frames: FrameRadar[] = [];
  for (const frame of pasados) {
    const registro = typeof frame === 'object' && frame !== null ? (frame as Record<string, unknown>) : {};
    if (
      typeof registro.time !== 'number' ||
      typeof registro.path !== 'string' ||
      !RUTA_PERMITIDA.test(registro.path)
    ) {
      throw new Error('Índice de radar inválido: frame mal formado');
    }
    frames.push({ tiempoS: registro.time, ruta: registro.path });
  }
  frames.sort((a, b) => a.tiempoS - b.tiempoS);

  return {
    host: raiz.host,
    generadoS: typeof raiz.generated === 'number' ? raiz.generated : 0,
    frames,
  };
}

export async function fetchIndiceRadar(): Promise<IndiceRadar> {
  return parseIndiceRadar(await fetchJson(config.urls.rainviewer));
}

export function urlTileRadar(host: string, ruta: string, zoom: number, tx: number, ty: number): string {
  return `${host}${ruta}/${config.radar.tamanoTile}/${zoom}/${tx}/${ty}/${ESQUEMA_COLOR}/0_0.png`;
}

export function urlTileCobertura(host: string, zoom: number, tx: number, ty: number): string {
  return `${host}/v2/coverage/0/${config.radar.tamanoTile}/${zoom}/${tx}/${ty}/0/0_0.png`;
}

/** Plantilla `{z}/{x}/{y}` de un frame, para la capa de Leaflet. */
export function plantillaTilesMapa(host: string, ruta: string): string {
  return `${host}${ruta}/${config.radar.tamanoTile}/{z}/{x}/{y}/${ESQUEMA_COLOR}/0_0.png`;
}

async function abrirImagen(blob: Blob): Promise<ImageBitmap> {
  try {
    // Sin conversión de color para conservar los valores exactos de la paleta.
    return await createImageBitmap(blob, { colorSpaceConversion: 'none' });
  } catch {
    return createImageBitmap(blob);
  }
}

/** Descarga un tile PNG y lo convierte a píxeles RGBA mediante un canvas. */
export async function cargarTile(url: string): Promise<TileRgba> {
  const imagen = await abrirImagen(await fetchBlob(url));
  try {
    const { width: ancho, height: alto } = imagen;
    const contexto =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(ancho, alto).getContext('2d', { willReadFrequently: true })
        : Object.assign(document.createElement('canvas'), { width: ancho, height: alto }).getContext('2d', {
            willReadFrequently: true,
          });
    if (!contexto) {
      throw new Error('Canvas 2D no disponible');
    }
    contexto.drawImage(imagen, 0, 0);
    const pixeles = contexto.getImageData(0, 0, ancho, alto);
    return { data: pixeles.data, ancho, alto };
  } finally {
    imagen.close();
  }
}
