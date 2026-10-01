import { config } from '../config';
import './Cielo.css';
import './Estados.css';

const PILDORAS = [0, 1, 2, 3, 4];

/** Carga inicial: el bloque azul con la marca real, relleno gris y el único aviso de estado. */
export function EsqueletoCielo() {
  return (
    <>
      <header className="cielo cielo--esqueleto app__sangrado" aria-busy="true">
        <div className="cielo__barra">
          <div className="cielo__marca">
            <span className="cielo__emblema">
              <svg
                className="cielo__icono" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"
                stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 3.2c3.2 4 5.8 7 5.8 10.2a5.8 5.8 0 0 1-11.6 0C6.2 10.2 8.8 7.2 12 3.2z" />
              </svg>
            </span>
            <h1 className="cielo__titulo">{config.appName}</h1>
          </div>
        </div>
        <div className="esqueleto__relleno" aria-hidden="true">
          <span className="esqueleto__barra esqueleto__barra--hora" />
          <span className="esqueleto__barra esqueleto__barra--numero" />
          <span className="esqueleto__barra esqueleto__barra--mensaje" />
          <span className="esqueleto__barra esqueleto__barra--frase" />
          <span className="esqueleto__barra esqueleto__barra--chip" />
        </div>
      </header>
      <p role="status" className="estado__mensaje">Obteniendo pronóstico…</p>
      <div className="esqueleto__pildoras" aria-hidden="true">
        {PILDORAS.map((i) => <span className="esqueleto__pildora" key={i} />)}
      </div>
    </>
  );
}
