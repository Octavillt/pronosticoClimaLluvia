import type { CSSProperties } from 'react';

export const COLORES_AVISO_SIN_CONEXION = { fondo: '#5f6368', texto: '#ffffff' } as const;

const banner: CSSProperties = {
  background: COLORES_AVISO_SIN_CONEXION.fondo,
  color: COLORES_AVISO_SIN_CONEXION.texto,
  padding: '12px',
  borderRadius: 8,
  margin: '8px 0',
};

export function AvisoSinConexion({ enLinea }: { enLinea: boolean }) {
  if (enLinea) return null;
  return (
    <div role="status" style={banner}>
      Sin conexión. Puede que el pronóstico no esté actualizado.
    </div>
  );
}
