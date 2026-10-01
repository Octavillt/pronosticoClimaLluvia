import { config } from '../config';
import { construirPildoras } from '../utils/pildoras';
import './ProximasHoras.css';

interface Props {
  horasUtc: string[];
  pop: number[];
  pesoRadar: number[];
  desde: number;
  ahoraMs: number;
  timezone: string;
}

const TRAZO_GOTA = 'M20 3 C28 14 35 22 35 33 A15 15 0 0 1 5 33 C5 22 12 14 20 3 Z';

export function ProximasHoras(props: Props) {
  const pildoras = construirPildoras({ ...props, horas: config.ui.horasPildoras });
  if (pildoras.length === 0) {
    return null;
  }
  return (
    <section className="proximas app__sangrado">
      <div className="proximas__cabecera">
        <h2 className="proximas__titulo">Próximas horas</h2>
        <span className="proximas__pista" aria-hidden="true">Desliza ›</span>
      </div>
      <ul className="proximas__lista" aria-label="Probabilidad de lluvia de las próximas horas" tabIndex={0}>
        {pildoras.map((pildora, posicion) => {
          if (pildora.tipo === 'dia') {
            return <li className="pildora pildora--dia" key={`dia-${posicion}`}>{pildora.etiqueta}</li>;
          }
          const altura = Math.max(1.5, 45 * pildora.porcentaje / 100);
          const idClip = `clip-gota-${pildora.i}`;
          return (
            <li className="pildora" key={pildora.i} data-actual={pildora.i === 0 ? true : undefined}>
              <span className="pildora__hora">{pildora.etiqueta}</span>
              <svg
                className="pildora__gota" width="40" height="50" viewBox="0 0 40 52" focusable="false"
                data-testid={`barra-pop-${pildora.i}`} data-radar={pildora.conRadar ? 'si' : 'no'}
              >
                <title>{pildora.titulo}</title>
                <clipPath id={idClip}>
                  <rect x="0" y={48 - altura} width="40" height={altura} />
                </clipPath>
                <path className="pildora__relleno" d={TRAZO_GOTA} clipPath={`url(#${idClip})`} />
                <path className="pildora__contorno" d={TRAZO_GOTA} />
              </svg>
              <span className="pildora__porcentaje">{pildora.porcentaje}%</span>
              <span className="pildora__radar">{pildora.conRadar ? 'con radar' : ''}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
