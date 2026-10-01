import { config } from '../config';
import type { GeoPoint } from '../domain/types';
import type { ResumenCielo } from '../utils/mensajeCielo';
import { IlustracionCielo } from './IlustracionCielo';
import './Cielo.css';

interface Props {
  punto: GeoPoint;
  nombre: string | null;
  resumen: ResumenCielo;
  horasVerificadas: number | null;
  onCambiar: () => void;
}

export function Cielo({ punto, nombre, resumen, horasVerificadas, onCambiar }: Props) {
  const coordenadas = `${punto.lat.toFixed(2)}, ${punto.lon.toFixed(2)}`.replaceAll('-', '−');
  return (
    <header className="cielo app__sangrado" data-nivel={resumen.nivel}>
      <IlustracionCielo nivel={resumen.nivel} />
      <div className="cielo__barra">
        <div className="cielo__marca">
          <span className="cielo__emblema">
            <svg
              className="cielo__icono" width="20" height="20" viewBox="0 0 24 24"
              fill="currentColor" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            >
              <path d="M12 3.2c3.2 4 5.8 7 5.8 10.2a5.8 5.8 0 0 1-11.6 0C6.2 10.2 8.8 7.2 12 3.2z" />
            </svg>
          </span>
          <h1 className="cielo__titulo">{config.appName}</h1>
        </div>
        <button className="cielo__cambiar" type="button" onClick={onCambiar}>Cambiar</button>
      </div>
      <p className="cielo__lugar">
        <svg
          className="cielo__icono" width="18" height="18" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        >
          <path d="M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z" />
          <circle cx="12" cy="10.5" r="2.3" />
        </svg>
        <span className="cielo__nombre">{nombre ?? 'Tu ubicación'}</span>
        <span className="cielo__coordenadas">{coordenadas}</span>
      </p>
      <section aria-label="Probabilidad de lluvia actual" className="cielo__pronostico">
        {!resumen.vencido && <p className="cielo__hora">{resumen.etiquetaHora}</p>}
        <p className="cielo__numero" data-testid="pop-ahora">
          <span className="cielo__cifra">{resumen.porcentaje}</span>
          <span className="cielo__porcentaje">%</span>
        </p>
        <p className="cielo__accion">
          {resumen.vencido
            ? 'Este pronóstico ya venció. Recarga la página para actualizarlo.'
            : resumen.accion}
        </p>
        {!resumen.vencido && resumen.frase && <p className="cielo__frase">{resumen.frase}</p>}
        <p className="chip cielo__radar" data-tono={resumen.chipRadar.tono}>
          <svg
            className="cielo__icono" width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          >
            <path d="M4 12h15M13 6l6 6-6 6" />
          </svg>
          {resumen.chipRadar.texto}
        </p>
        <p className="cielo__origen" data-testid="origen-pop">
          {resumen.conRadar
            ? 'Combina el radar con el ensamble de modelos.'
            : 'Basada en el ensamble de modelos.'}
        </p>
        {horasVerificadas !== null && (
          <p className="cielo__calibracion" data-testid="aviso-calibracion">
            Calibrada con tu historial local ({horasVerificadas} horas verificadas)
          </p>
        )}
      </section>
    </header>
  );
}
