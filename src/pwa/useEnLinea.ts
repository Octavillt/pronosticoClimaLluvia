import { useEffect, useState } from 'react';

export function useEnLinea(): boolean {
  const [enLinea, setEnLinea] = useState(() => navigator.onLine);
  useEffect(() => {
    const alEntrar = () => setEnLinea(true);
    const alSalir = () => setEnLinea(false);
    window.addEventListener('online', alEntrar);
    window.addEventListener('offline', alSalir);
    return () => {
      window.removeEventListener('online', alEntrar);
      window.removeEventListener('offline', alSalir);
    };
  }, []);
  return enLinea;
}
