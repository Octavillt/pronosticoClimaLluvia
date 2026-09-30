import { config } from '../config';
import type { ParVerificado } from '../domain/types';
import { MS_HORA } from '../utils/horas';
import { horizonteDe } from './verificacion';

/** Punto de una curva monótona creciente: PoP emitida (x) → frecuencia observada (y). */
export interface PuntoIsotonico {
  x: number;
  y: number;
}

export interface ModeloIsotonico {
  puntos: PuntoIsotonico[];
  /** Pares con los que se ajustó. */
  n: number;
}

/** Modelos por cota de horizonte (h). Un horizonte sin modelo se queda con la identidad. */
export type Calibracion = Record<number, ModeloIsotonico>;

export const SIN_CALIBRACION: Calibracion = {};

interface Bloque {
  peso: number;
  sumaX: number;
  sumaY: number;
}

const media = (suma: number, peso: number) => suma / peso;

/**
 * Regresión isotónica por PAV (pool adjacent violators): la curva no decreciente que mejor
 * ajusta `y` en función de `x`. Los `x` repetidos se juntan primero; cada bloque final aporta
 * un punto (media de x, media de y) y entre puntos se interpola.
 */
export function ajustarIsotonica(datos: { x: number; y: number }[]): ModeloIsotonico {
  if (datos.length === 0) {
    return { puntos: [], n: 0 };
  }
  const ordenados = [...datos].sort((a, b) => a.x - b.x);
  const bloques: Bloque[] = [];
  for (let i = 0; i < ordenados.length; ) {
    let j = i;
    let sumaY = 0;
    while (j < ordenados.length && ordenados[j].x === ordenados[i].x) {
      sumaY += ordenados[j].y;
      j += 1;
    }
    let nuevo: Bloque = { peso: j - i, sumaX: ordenados[i].x * (j - i), sumaY };
    while (bloques.length > 0) {
      const previo = bloques[bloques.length - 1];
      if (media(previo.sumaY, previo.peso) <= media(nuevo.sumaY, nuevo.peso)) {
        break;
      }
      bloques.pop();
      nuevo = {
        peso: previo.peso + nuevo.peso,
        sumaX: previo.sumaX + nuevo.sumaX,
        sumaY: previo.sumaY + nuevo.sumaY,
      };
    }
    bloques.push(nuevo);
    i = j;
  }
  return {
    puntos: bloques.map((b) => ({ x: media(b.sumaX, b.peso), y: media(b.sumaY, b.peso) })),
    n: datos.length,
  };
}

/** Evalúa el modelo en `x` (interpolación lineal, constante fuera del rango) y evita 0 y 1. */
export function aplicarIsotonica(modelo: ModeloIsotonico, x: number): number {
  const { puntos } = modelo;
  const { popMinima, popMaxima } = config.verificacion;
  if (puntos.length === 0) {
    return x;
  }
  let y: number;
  if (x <= puntos[0].x) {
    y = puntos[0].y;
  } else if (x >= puntos[puntos.length - 1].x) {
    y = puntos[puntos.length - 1].y;
  } else {
    const k = puntos.findIndex((p) => p.x >= x);
    const a = puntos[k - 1];
    const b = puntos[k];
    y = a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
  }
  return Math.min(popMaxima, Math.max(popMinima, y));
}

/** Un modelo por horizonte que ya junta los pares mínimos; los demás quedan sin calibrar. */
export function construirCalibracion(
  pares: ParVerificado[],
  minimos: number = config.verificacion.paresMinimosCalibracion,
): Calibracion {
  const porHorizonte = new Map<number, ParVerificado[]>();
  for (const par of pares) {
    porHorizonte.set(par.horizonteH, [...(porHorizonte.get(par.horizonteH) ?? []), par]);
  }
  const calibracion: Calibracion = {};
  for (const [horizonteH, delHorizonte] of porHorizonte) {
    if (delHorizonte.length >= minimos) {
      calibracion[horizonteH] = ajustarIsotonica(
        delHorizonte.map((p) => ({ x: p.pop, y: p.observado })),
      );
    }
  }
  return calibracion;
}

/** PoP corregida de una hora que termina en `finMs`, o la misma si su horizonte no tiene modelo. */
export function calibrarPop(calibracion: Calibracion, pop: number, finMs: number, ahoraMs: number): number {
  const horizonteH = horizonteDe((finMs - ahoraMs) / MS_HORA);
  const modelo = horizonteH === null ? undefined : calibracion[horizonteH];
  return modelo ? aplicarIsotonica(modelo, pop) : pop;
}

export function calibrarSerie(
  calibracion: Calibracion,
  horasUtc: string[],
  pop: number[],
  ahoraMs: number,
): number[] {
  return pop.map((valor, i) => calibrarPop(calibracion, valor, Date.parse(horasUtc[i]), ahoraMs));
}
