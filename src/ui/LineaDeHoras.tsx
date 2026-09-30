import { MS_HORA } from '../utils/horas';
import { formatHoraLocal } from '../utils/localTime';

interface Props {
  horasUtc: string[];
  pop: number[];
  timezone: string;
  /** Peso del radar por hora; las barras donde pesa se dibujan con otro color. */
  pesoRadar?: number[];
  /** Índice de la primera hora a dibujar (la hora en curso). */
  desde?: number;
  horas?: number;
}

const ANCHO = 640;
const ALTO = 160;
const MARGEN = 24;
const PESO_VISIBLE = 0.05;

export function LineaDeHoras({ horasUtc, pop, timezone, pesoRadar, desde = 0, horas = 24 }: Props) {
  const n = Math.min(horas, horasUtc.length - desde, pop.length - desde);
  if (n <= 0) {
    return null;
  }
  const paso = (ANCHO - MARGEN * 2) / n;
  const hayRadar = pesoRadar?.slice(desde, desde + n).some((p) => p > PESO_VISIBLE) ?? false;
  return (
    <section aria-label="Probabilidad por hora">
      <h2>Próximas horas</h2>
      <svg
        role="img"
        aria-label="Probabilidad de lluvia de las próximas horas"
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        style={{ width: '100%', maxWidth: ANCHO }}
      >
        {Array.from({ length: n }, (_, i) => {
          const k = desde + i;
          const altura = Math.max(2, pop[k] * (ALTO - MARGEN * 2));
          const x = MARGEN + i * paso;
          const y = ALTO - MARGEN - altura;
          const inicioUtc = new Date(Date.parse(horasUtc[k]) - MS_HORA).toISOString();
          const conRadar = (pesoRadar?.[k] ?? 0) > PESO_VISIBLE;
          return (
            <g key={horasUtc[k]}>
              <rect
                data-testid={`barra-pop-${i}`}
                data-radar={conRadar ? 'si' : 'no'}
                x={x + 1}
                y={y}
                width={Math.max(1, paso - 2)}
                height={altura}
                fill={conRadar ? '#0f766e' : '#2563eb'}
              >
                <title>
                  {formatHoraLocal(inicioUtc, timezone)} a {formatHoraLocal(horasUtc[k], timezone)} h:{' '}
                  {Math.round(pop[k] * 100)} %
                </title>
              </rect>
              {i % 3 === 0 && (
                <text x={x + paso / 2} y={ALTO - 8} fontSize="10" textAnchor="middle">
                  {formatHoraLocal(inicioUtc, timezone)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p style={{ fontSize: '0.85rem' }}>
        Cada barra es la probabilidad de lluvia de la hora que empieza a la hora indicada.
        {hayRadar && ' Las barras verdes incluyen el radar.'}
      </p>
    </section>
  );
}
