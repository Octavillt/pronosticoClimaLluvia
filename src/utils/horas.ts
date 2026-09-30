export const MS_HORA = 3_600_000;

/**
 * Índice de la etiqueta horaria cuyo intervalo contiene al instante dado.
 *
 * En Open-Meteo la precipitación de la etiqueta `T` es la suma de la hora anterior, es decir
 * del intervalo `(T − 1 h, T]`. Por eso la hora "en curso" a las 21:36 lleva la etiqueta 22:00.
 * Si el instante queda fuera de la serie se devuelve 0.
 */
export function indiceHoraEnCurso(horasUtc: string[], ahoraMs: number): number {
  const indice = horasUtc.findIndex((hora) => Date.parse(hora) > ahoraMs);
  return indice === -1 ? 0 : indice;
}
