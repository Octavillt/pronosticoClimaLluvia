import { config } from '../config';
import type { Movimiento } from '../domain/types';

export interface OpcionesMovimiento {
  /** Semilado (px) de la ventana donde se correlaciona. */
  mitadRegion: number;
  /** Desplazamiento máximo buscado entre frames, en px. */
  radioBusqueda: number;
  correlacionMinima: number;
  /** Píxeles con eco mínimos en la ventana para intentar estimar movimiento. */
  ecosMinimos: number;
  /** Debajo de este dBZ el píxel no participa en la correlación. */
  umbralEcoDbz: number;
}

export type Desplazamiento =
  | { tipo: 'ok'; dx: number; dy: number; calidad: number }
  | { tipo: 'sin-ecos' }
  | { tipo: 'incierto' };

/** Intensidad para correlacionar: dBZ (tope 50) sobre el umbral de eco, 0 en otro caso. */
function intensidad(dbz: Float32Array, umbralEco: number): Float32Array {
  const salida = new Float32Array(dbz.length);
  for (let i = 0; i < dbz.length; i += 1) {
    salida[i] = dbz[i] >= umbralEco ? Math.min(dbz[i], 50) : 0;
  }
  return salida;
}

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.max(minimo, Math.min(maximo, valor));
}

/** Refinamiento subpíxel del pico de una curva con tres muestras (parábola). */
function picoParabolico(izquierda: number, centro: number, derecha: number): number {
  const denominador = izquierda - 2 * centro + derecha;
  if (Math.abs(denominador) < 1e-9) {
    return 0;
  }
  return limitar((0.5 * (izquierda - derecha)) / denominador, -0.5, 0.5);
}

/**
 * Desplazamiento (px) que hay que aplicar al frame `antes` para obtener `despues`, buscado por
 * correlación cruzada normalizada en una ventana centrada en (cx, cy).
 *
 * Cumple `despues(x) ≈ antes(x − d)`, así que `d` es también el avance de la lluvia entre frames.
 * Solo los píxeles con eco de `despues` se recorren de forma explícita; las sumas de `antes` en
 * cada ventana desplazada salen de imágenes integrales, así que el costo por desplazamiento es
 * proporcional a los ecos y no al área de la ventana.
 */
export function estimarDesplazamiento(
  antes: Float32Array,
  despues: Float32Array,
  lado: number,
  cx: number,
  cy: number,
  opciones: OpcionesMovimiento = config.radar.movimiento,
): Desplazamiento {
  const { mitadRegion, radioBusqueda: radio, correlacionMinima, ecosMinimos, umbralEcoDbz } = opciones;
  const ventana = 2 * mitadRegion;
  const extendida = ventana + 2 * radio;
  if (lado < extendida) {
    throw new Error(`Mosaico de ${lado} px demasiado chico para una ventana de ${extendida} px`);
  }

  const x0 = limitar(Math.round(cx) - mitadRegion, radio, lado - ventana - radio);
  const y0 = limitar(Math.round(cy) - mitadRegion, radio, lado - ventana - radio);
  const nuevo = intensidad(despues, umbralEcoDbz);
  const viejo = intensidad(antes, umbralEcoDbz);

  // Ecos del frame nuevo dentro de la ventana, en coordenadas locales de la ventana.
  const xs: number[] = [];
  const ys: number[] = [];
  const valores: number[] = [];
  let sumaN = 0;
  let sumaN2 = 0;
  for (let y = 0; y < ventana; y += 1) {
    for (let x = 0; x < ventana; x += 1) {
      const v = nuevo[(y0 + y) * lado + x0 + x];
      if (v > 0) {
        xs.push(x);
        ys.push(y);
        valores.push(v);
        sumaN += v;
        sumaN2 += v * v;
      }
    }
  }
  if (xs.length < ecosMinimos) {
    return { tipo: 'sin-ecos' };
  }

  const area = ventana * ventana;
  const varianzaN = sumaN2 - (sumaN * sumaN) / area;
  if (varianzaN < 1e-9) {
    return { tipo: 'sin-ecos' };
  }

  // Región extendida del frame viejo, con imágenes integrales de v y v².
  const ancho = extendida + 1;
  const integral = new Float64Array(ancho * ancho);
  const integral2 = new Float64Array(ancho * ancho);
  const region = new Float32Array(extendida * extendida);
  for (let y = 0; y < extendida; y += 1) {
    let fila = 0;
    let fila2 = 0;
    for (let x = 0; x < extendida; x += 1) {
      const v = viejo[(y0 - radio + y) * lado + x0 - radio + x];
      region[y * extendida + x] = v;
      fila += v;
      fila2 += v * v;
      integral[(y + 1) * ancho + x + 1] = integral[y * ancho + x + 1] + fila;
      integral2[(y + 1) * ancho + x + 1] = integral2[y * ancho + x + 1] + fila2;
    }
  }
  const sumaVentana = (tabla: Float64Array, ox: number, oy: number): number =>
    tabla[(oy + ventana) * ancho + ox + ventana] -
    tabla[oy * ancho + ox + ventana] -
    tabla[(oy + ventana) * ancho + ox] +
    tabla[oy * ancho + ox];

  const lado2 = 2 * radio + 1;
  const superficie = new Float32Array(lado2 * lado2).fill(-1);
  let mejor = -Infinity;
  let mejorX = 0;
  let mejorY = 0;

  for (let sy = -radio; sy <= radio; sy += 1) {
    for (let sx = -radio; sx <= radio; sx += 1) {
      const ox = radio - sx;
      const oy = radio - sy;
      const sumaO = sumaVentana(integral, ox, oy);
      const sumaO2 = sumaVentana(integral2, ox, oy);
      const varianzaO = sumaO2 - (sumaO * sumaO) / area;
      if (varianzaO < 1e-9) {
        continue;
      }
      let cruzada = 0;
      for (let k = 0; k < xs.length; k += 1) {
        cruzada += valores[k] * region[(ys[k] + oy) * extendida + xs[k] + ox];
      }
      const correlacion = (cruzada - (sumaN * sumaO) / area) / Math.sqrt(varianzaN * varianzaO);
      superficie[(sy + radio) * lado2 + sx + radio] = correlacion;
      if (correlacion > mejor) {
        mejor = correlacion;
        mejorX = sx;
        mejorY = sy;
      }
    }
  }

  const enBorde = Math.abs(mejorX) === radio || Math.abs(mejorY) === radio;
  if (mejor < correlacionMinima || enBorde) {
    return { tipo: 'incierto' };
  }

  const en = (sx: number, sy: number): number => superficie[(sy + radio) * lado2 + sx + radio];
  const dx = mejorX + picoParabolico(en(mejorX - 1, mejorY), mejor, en(mejorX + 1, mejorY));
  const dy = mejorY + picoParabolico(en(mejorX, mejorY - 1), mejor, en(mejorX, mejorY + 1));
  return { tipo: 'ok', dx, dy, calidad: mejor };
}

export interface CampoFechado {
  tMs: number;
  dbz: Float32Array;
}

/**
 * Movimiento de la lluvia (px/min) a partir de frames consecutivos, del más viejo al más reciente.
 * Cada par aporta un vector ponderado por su correlación.
 */
export function estimarMovimiento(
  campos: CampoFechado[],
  lado: number,
  cx: number,
  cy: number,
  opciones: OpcionesMovimiento = config.radar.movimiento,
): Movimiento {
  let sumaPesos = 0;
  let vx = 0;
  let vy = 0;
  let hayIncierto = false;

  for (let i = 1; i < campos.length; i += 1) {
    const minutos = (campos[i].tMs - campos[i - 1].tMs) / 60_000;
    if (minutos <= 0) {
      continue;
    }
    const par = estimarDesplazamiento(campos[i - 1].dbz, campos[i].dbz, lado, cx, cy, opciones);
    if (par.tipo === 'ok') {
      vx += (par.dx / minutos) * par.calidad;
      vy += (par.dy / minutos) * par.calidad;
      sumaPesos += par.calidad;
    } else if (par.tipo === 'incierto') {
      hayIncierto = true;
    }
  }

  if (sumaPesos > 0) {
    return {
      estado: 'estimado',
      vxPxMin: vx / sumaPesos,
      vyPxMin: vy / sumaPesos,
      calidad: sumaPesos / Math.max(1, campos.length - 1),
    };
  }
  return hayIncierto ? { estado: 'incierto' } : { estado: 'sin-ecos' };
}
