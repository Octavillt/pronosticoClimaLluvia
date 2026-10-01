import { PALETA_OPACA } from './paleta';

export interface TramoLeyenda {
  clave: 'ligera' | 'moderada' | 'fuerte' | 'intensa';
  etiqueta: string;
  dbz: number;
  color: string;
}

export function colorDeDbz(dbz: number): string {
  const entrada = PALETA_OPACA.find(([valor]) => valor === dbz);
  if (!entrada) {
    throw new Error(`No existe ${dbz} dBZ en la paleta opaca del radar`);
  }
  return `#${entrada[1].toString(16).padStart(6, '0')}`;
}

export const TRAMOS_LEYENDA: readonly TramoLeyenda[] = [
  { clave: 'ligera', etiqueta: 'Ligera', dbz: 20, color: colorDeDbz(20) },
  { clave: 'moderada', etiqueta: 'Moderada', dbz: 30, color: colorDeDbz(30) },
  { clave: 'fuerte', etiqueta: 'Fuerte', dbz: 40, color: colorDeDbz(40) },
  { clave: 'intensa', etiqueta: 'Intensa', dbz: 50, color: colorDeDbz(50) },
];
