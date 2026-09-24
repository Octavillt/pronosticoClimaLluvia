import { formatHoraLocal } from '../utils/localTime';

interface Props {
  pop: number;
  horaUtc: string;
  timezone: string;
}

export function ProbabilidadAhora({ pop, horaUtc, timezone }: Props) {
  const porcentaje = Math.round(pop * 100);
  return (
    <section aria-label="Probabilidad de lluvia actual">
      <p style={{ fontSize: '3rem', margin: 0 }} data-testid="pop-ahora">
        {porcentaje}%
      </p>
      <p>
        probabilidad de lluvia a las{' '}
        <time dateTime={horaUtc}>{formatHoraLocal(horaUtc, timezone)} h</time>
      </p>
    </section>
  );
}
