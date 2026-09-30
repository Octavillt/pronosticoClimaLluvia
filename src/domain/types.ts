export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface SerieMiembros {
  modelo: string;
  /** Una serie horaria por miembro (control incluido). */
  miembros: number[][];
}

export interface RespuestaEnsamble {
  horasUtc: string[];
  porModelo: SerieMiembros[];
  modelosFallidos: string[];
}

export interface RespuestaPronostico {
  timezone: string;
  horasUtc: string[];
  temperaturaC: (number | null)[];
  precipitacionMm: (number | null)[];
  codigoClima: (number | null)[];
}

export type EstadoFuente = 'ok' | 'degradado' | 'error';

export interface EstadoFuentes {
  ensamble: EstadoFuente;
  modelosFallidos: string[];
  complemento: EstadoFuente;
  cache: 'hit' | 'miss';
}

export type ResultadoPronostico =
  | {
      tipo: 'ok';
      punto: GeoPoint;
      timezone: string;
      horasUtc: string[];
      pop: number[];
      precipitacionMm: (number | null)[];
      temperaturaC: (number | null)[];
      codigoClima: (number | null)[];
      fuentes: EstadoFuentes;
    }
  | { tipo: 'fuera-mexico'; punto: GeoPoint };

export interface CiudadEncontrada {
  nombre: string;
  estado: string;
  lat: number;
  lon: number;
}

export interface FrameRadar {
  /** Instante del frame, en segundos Unix (UTC). */
  tiempoS: number;
  /** Ruta base de sus tiles, p. ej. `/v2/radar/abc123`. */
  ruta: string;
}

export interface IndiceRadar {
  host: string;
  generadoS: number;
  /** Frames pasados, del más viejo al más reciente. */
  frames: FrameRadar[];
}

/** Imagen RGBA cruda, compatible con `ImageData`. */
export interface TileRgba {
  data: Uint8ClampedArray;
  ancho: number;
  alto: number;
}

export type Movimiento =
  | { estado: 'estimado'; vxPxMin: number; vyPxMin: number; calidad: number }
  /** No hay ecos cerca que seguir: se asume quieto sin penalizar el peso. */
  | { estado: 'sin-ecos' }
  /** Hay ecos pero la correlación es pobre: se asume quieto y se penaliza el peso. */
  | { estado: 'incierto' };

export interface PasoNowcast {
  tMs: number;
  /** Probabilidad de lluvia según el radar (fracción de píxeles con eco). */
  pop: number;
  /** Fracción del disco de análisis que tiene cobertura de radar, 0–1. */
  cobertura: number;
}

export interface Nowcast {
  /** Instante (ms UTC) del frame de radar más reciente. */
  tFrameMs: number;
  movimiento: Movimiento;
  /** Frames anteriores al más reciente, observados en el punto. */
  observados: PasoNowcast[];
  /** Del frame más reciente hacia adelante, advectado con el movimiento. */
  pronostico: PasoNowcast[];
  /** Velocidad y rumbo del avance de la lluvia, si se pudo estimar. */
  avance: { kmh: number; haciaGrados: number } | null;
}

export type ResultadoNowcast =
  | { tipo: 'ok'; nowcast: Nowcast; indice: IndiceRadar }
  | { tipo: 'sin-cobertura' }
  | { tipo: 'desactualizado'; edadMin: number }
  | { tipo: 'sin-datos'; motivo: string };

export type EstadoRadar =
  | { estado: 'cargando' }
  | { estado: 'ok'; tFrameMs: number; avance: Nowcast['avance'] }
  | { estado: 'sin-cobertura' }
  | { estado: 'desactualizado'; edadMin: number }
  | { estado: 'error'; mensaje: string };
