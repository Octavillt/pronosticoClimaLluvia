import { config } from '../config';
import './Estados.css';

/** Barra de marca de las pantallas que aún no tienen pronóstico (la del pronóstico vive en `Cielo`). */
export function Encabezado() {
  return (
    <header className="encabezado">
      <span className="encabezado__logo">
        <svg
          width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor"
          strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        >
          <path d="M12 3.2c3.2 4 5.8 7 5.8 10.2a5.8 5.8 0 0 1-11.6 0C6.2 10.2 8.8 7.2 12 3.2z" />
        </svg>
      </span>
      <h1 className="encabezado__titulo">{config.appName}</h1>
    </header>
  );
}
