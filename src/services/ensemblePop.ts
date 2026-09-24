import type { SerieMiembros } from '../domain/types';

export const UMBRAL_LLUVIA_MM = 0.2;

export function memberPop(
  miembros: number[][],
  horaIdx: number,
  umbral: number = UMBRAL_LLUVIA_MM,
): number {
  const n = miembros.length;
  if (n === 0) {
    return 0;
  }
  let llueven = 0;
  for (const serie of miembros) {
    const valor = serie[horaIdx];
    if (valor !== undefined && valor >= umbral) {
      llueven += 1;
    }
  }
  return (llueven + 0.5) / (n + 1);
}

export function computePopSeries(porModelo: SerieMiembros[], numHoras: number): number[] {
  const totalMiembros = porModelo.reduce((acc, m) => acc + m.miembros.length, 0);
  if (totalMiembros === 0 || numHoras <= 0) {
    return [];
  }
  const pop: number[] = [];
  for (let h = 0; h < numHoras; h += 1) {
    let ponderada = 0;
    for (const serie of porModelo) {
      ponderada += memberPop(serie.miembros, h) * serie.miembros.length;
    }
    pop.push(ponderada / totalMiembros);
  }
  return pop;
}
