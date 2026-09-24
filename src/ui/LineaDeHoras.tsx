import { formatHoraLocal } from '../utils/localTime';

interface Props {
  horasUtc: string[];
  pop: number[];
  timezone: string;
  horas?: number;
}

const ANCHO = 640;
const ALTO = 160;
const MARGEN = 24;

export function LineaDeHoras({ horasUtc, pop, timezone, horas = 24 }: Props) {
  const n = Math.min(horas, horasUtc.length, pop.length);
  if (n === 0) {
    return null;
  }
  const paso = (ANCHO - MARGEN * 2) / n;
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
          const altura = Math.max(2, pop[i] * (ALTO - MARGEN * 2));
          const x = MARGEN + i * paso;
          const y = ALTO - MARGEN - altura;
          return (
            <g key={horasUtc[i]}>
              <rect
                data-testid={`barra-pop-${i}`}
                x={x + 1}
                y={y}
                width={Math.max(1, paso - 2)}
                height={altura}
                fill="#2563eb"
              />
              {i % 3 === 0 && (
                <text x={x + paso / 2} y={ALTO - 8} fontSize="10" textAnchor="middle">
                  {formatHoraLocal(horasUtc[i], timezone)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </section>
  );
}
