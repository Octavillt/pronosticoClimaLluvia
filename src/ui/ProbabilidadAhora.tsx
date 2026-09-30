import { MS_HORA } from '../utils/horas';
import { formatHoraLocal } from '../utils/localTime';

interface Props {
  pop: number;
  /** Etiqueta horaria de Open-Meteo: el final del intervalo de una hora que resume. */
  horaUtc: string;
  timezone: string;
  /** Si el radar interviene de forma apreciable en este valor. */
  conRadar?: boolean;
}

export function ProbabilidadAhora({ pop, horaUtc, timezone, conRadar = false }: Props) {
  const porcentaje = Math.round(pop * 100);
  const finMs = Date.parse(horaUtc);
  const inicioUtc = new Date(finMs - MS_HORA).toISOString();
  return (
    <section aria-label="Probabilidad de lluvia actual">
      <p style={{ fontSize: '3rem', margin: 0 }} data-testid="pop-ahora">
        {porcentaje}%
      </p>
      <p>
        probabilidad de lluvia de{' '}
        <time dateTime={inicioUtc}>{formatHoraLocal(inicioUtc, timezone)}</time> a{' '}
        <time dateTime={horaUtc}>{formatHoraLocal(horaUtc, timezone)} h</time>
      </p>
      <p style={{ fontSize: '0.85rem', margin: 0 }} data-testid="origen-pop">
        {conRadar ? 'Combina el radar con el ensamble de modelos.' : 'Basada en el ensamble de modelos.'}
      </p>
    </section>
  );
}
