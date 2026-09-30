const PUNTOS = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'] as const;

/** Nombre del punto cardinal (de 8) más cercano a un rumbo en grados, 0 = norte, horario. */
export function nombreRumbo(grados: number): string {
  const normalizado = ((grados % 360) + 360) % 360;
  return PUNTOS[Math.round(normalizado / 45) % 8];
}
