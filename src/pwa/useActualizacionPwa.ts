import { useEffect, useState } from 'react';
import type { ControladorPwa } from './registro';

export function useActualizacionPwa(controlador: ControladorPwa | null): boolean {
  const [hay, setHay] = useState(() => controlador?.hayActualizacion() ?? false);
  useEffect(() => {
    if (!controlador) return;
    setHay(controlador.hayActualizacion());
    return controlador.suscribirse(setHay);
  }, [controlador]);
  return hay;
}
