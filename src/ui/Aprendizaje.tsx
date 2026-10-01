import { useState, type CSSProperties } from 'react';
import type { ProgresoAprendizaje } from '../utils/aprendizaje';
import { PanelExactitud } from './PanelExactitud';
import type { EstadoVerificacion } from './useVerificacion';
import './Aprendizaje.css';

interface Props {
  progreso: ProgresoAprendizaje;
  observaciones: number | null;
  panel: Pick<EstadoVerificacion, 'resumen' | 'disponible' | 'exportar' | 'importar' | 'borrar'>;
}

export function Aprendizaje({ progreso, observaciones, panel }: Props) {
  const [abierto, setAbierto] = useState(false);
  const { estado, n, meta, faltan, fraccion } = progreso;
  const conDatos = estado === 'sin-datos' || estado === 'aprendiendo' || estado === 'calibrado';
  const textos: Record<ProgresoAprendizaje['estado'], string> = {
    'sin-datos': `Aún no hay horas verificadas. Con ${meta} en una misma franja horaria, ` +
      'el pronóstico se ajusta a tu zona.',
    aprendiendo: `Ya hay ${n} de ${meta} horas verificadas en esta franja horaria. ` +
      `Faltan ${faltan} para que el pronóstico se ajuste a tu zona.`,
    calibrado: `El pronóstico ya se ajusta a tu zona con ${n} horas verificadas en esta franja horaria.`,
    cargando: 'Leyendo tu historial local…',
    'sin-almacenamiento': 'Tu navegador no permite guardar el historial, ' +
      'así que el pronóstico no se ajusta a tu zona.',
  };
  return (
    <>
      <section className="tarjeta aprendizaje" aria-label="Aprendizaje del pronóstico">
        <h2 className="aprendizaje__titulo">Tu pronóstico va aprendiendo</h2>
        <p className="aprendizaje__texto">{textos[estado]}</p>
        {conDatos && (
          <>
            <div className="aprendizaje__progreso">
              <span className="aprendizaje__cantidad">{n} de {meta}</span>
              <span className="aprendizaje__observaciones">
                {observaciones === 1
                  ? '1 observación guardada'
                  : `${observaciones ?? 0} observaciones guardadas`}
              </span>
            </div>
            <div className="aprendizaje__barra" role="progressbar"
              aria-label="Horas verificadas en esta franja horaria"
              aria-valuemin={0} aria-valuemax={meta} aria-valuenow={n}>
              <div className="aprendizaje__relleno"
                style={{ '--avance': String(fraccion) } as CSSProperties & Record<`--${string}`, string>} />
            </div>
          </>
        )}
        <button type="button" className="aprendizaje__alternar" aria-expanded={abierto}
          aria-controls="detalle-exactitud" onClick={() => setAbierto((valor) => !valor)}>
          {abierto ? 'Ocultar detalle de exactitud' : 'Ver detalle de exactitud'}
          <svg className="aprendizaje__chevron" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </section>
      <div id="detalle-exactitud" className="aprendizaje__detalle" hidden={!abierto}>
        <PanelExactitud {...panel} conGestion={false} />
      </div>
    </>
  );
}
