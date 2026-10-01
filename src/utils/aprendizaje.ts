import { config } from '../config';
import type { ResumenExactitud } from '../services/verificacion';

export type EstadoAprendizaje = 'cargando' | 'sin-almacenamiento' | 'sin-datos' | 'aprendiendo' | 'calibrado';

export interface ProgresoAprendizaje {
  estado: EstadoAprendizaje;
  n: number;
  meta: number;
  faltan: number;
  fraccion: number;
}

export function progresoAprendizaje(
  resumen: ResumenExactitud | null,
  disponible: boolean,
  horizonteH: number | null,
  meta: number = config.verificacion.paresMinimosCalibracion,
): ProgresoAprendizaje {
  let estado: EstadoAprendizaje;
  let n = 0;
  if (!disponible) {
    estado = 'sin-almacenamiento';
  } else if (resumen === null) {
    estado = 'cargando';
  } else if (horizonteH === null) {
    estado = 'sin-datos';
  } else {
    n = resumen.porHorizonte.find((fila) => fila.horizonteH === horizonteH)?.n ?? 0;
    estado = n >= meta ? 'calibrado' : n === 0 ? 'sin-datos' : 'aprendiendo';
  }
  return { estado, n, meta, faltan: Math.max(0, meta - n), fraccion: Math.min(1, n / meta) };
}
