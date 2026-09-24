import type { EstadoFuentes } from '../domain/types';

const ETIQUETAS: Record<string, string> = {
  ok: '✓',
  degradado: 'parcial',
  error: 'error',
};

export function EstadoFuentes({ fuentes }: { fuentes: EstadoFuentes }) {
  return (
    <section aria-label="Estado de fuentes">
      <h2>Fuentes</h2>
      <ul>
        <li>
          Ensamble Open-Meteo: {ETIQUETAS[fuentes.ensamble]}
          {fuentes.modelosFallidos.length > 0 &&
            ` (sin ${fuentes.modelosFallidos.join(', ')})`}
        </li>
        <li>Complemento horario: {ETIQUETAS[fuentes.complemento]}</li>
        <li>Caché: {fuentes.cache === 'hit' ? 'reutilizado' : 'consultado'}</li>
      </ul>
    </section>
  );
}
