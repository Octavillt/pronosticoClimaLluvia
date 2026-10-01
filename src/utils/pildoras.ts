import { config } from '../config';
import { claveDia, etiquetaDia } from './dias';
import { MS_HORA } from './horas';
import { formatHoraLocal } from './localTime';
import { porcentajeMostrado } from './lluvia';

export type Pildora =
  | { tipo: 'hora'; i: number; etiqueta: string; porcentaje: number; conRadar: boolean; titulo: string }
  | { tipo: 'dia'; etiqueta: string };

export function construirPildoras(e: {
  horasUtc: string[];
  pop: number[];
  pesoRadar?: number[];
  desde: number;
  horas: number;
  ahoraMs: number;
  timezone: string;
}): Pildora[] {
  const n = Math.min(e.horas, e.horasUtc.length - e.desde, e.pop.length - e.desde);
  if (n <= 0) {
    return [];
  }
  const pildoras: Pildora[] = [];
  let diaAnterior = '';
  for (let j = 0; j < n; j += 1) {
    const k = e.desde + j;
    const finMs = Date.parse(e.horasUtc[k]);
    const inicioMs = finMs - MS_HORA;
    const dia = claveDia(inicioMs, e.timezone);
    if (j > 0 && dia !== diaAnterior) {
      const etiqueta = etiquetaDia(inicioMs, e.ahoraMs, e.timezone);
      pildoras.push({ tipo: 'dia', etiqueta: etiqueta[0].toUpperCase() + etiqueta.slice(1) });
    }
    const inicioHora = formatHoraLocal(new Date(inicioMs).toISOString(), e.timezone);
    const finHora = formatHoraLocal(new Date(finMs).toISOString(), e.timezone);
    const porcentaje = porcentajeMostrado(e.pop[k]);
    pildoras.push({
      tipo: 'hora',
      i: j,
      etiqueta: j === 0 ? 'Ahora' : inicioHora,
      porcentaje,
      conRadar: (e.pesoRadar?.[k] ?? 0) > config.ui.pesoRadarVisible,
      titulo: `${inicioHora} a ${finHora} h: ${porcentaje} %`,
    });
    diaAnterior = dia;
  }
  return pildoras;
}
