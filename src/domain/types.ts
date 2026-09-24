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
