import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registrarServiceWorker } from './pwa/registro';

const contenedor = document.getElementById('root');
if (!contenedor) {
  throw new Error('No se encontró el elemento #root');
}

const controladorPwa = registrarServiceWorker();

createRoot(contenedor).render(
  <StrictMode>
    <App controladorPwa={controladorPwa} />
  </StrictMode>,
);
