import { config } from '../config';

export type NivelLluvia = 'alta' | 'media' | 'baja' | 'nula';

export function porcentajeMostrado(pop: number): number {
  if (!Number.isFinite(pop)) {
    return 0;
  }
  // El redondeo previo a 6 decimales evita que el ruido de coma flotante corra los bordes de .5.
  const producto = Number((pop * 100).toFixed(6));
  return Math.min(100, Math.max(0, Math.round(producto)));
}

export function nivelDeLluvia(pop: number): NivelLluvia {
  // Se clasifica el porcentaje que se muestra, para que el número y el mensaje nunca se contradigan.
  const porcentaje = porcentajeMostrado(pop);
  const { alta, media, baja } = config.ui.umbralesPorcentaje;
  if (porcentaje >= alta) {
    return 'alta';
  }
  if (porcentaje >= media) {
    return 'media';
  }
  if (porcentaje >= baja) {
    return 'baja';
  }
  return 'nula';
}

export const MENSAJE_ACCION: Record<NivelLluvia, string> = {
  alta: 'Lleva paraguas.',
  media: 'Posible lluvia: ten un paraguas a la mano.',
  baja: 'Poco probable que llueva.',
  nula: 'No se espera lluvia.',
};

/** Espacio de no separación (U+00A0): evita que el navegador parta un número de su unidad. */
export const NBSP = ' ';
