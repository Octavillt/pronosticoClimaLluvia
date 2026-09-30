import type { CSSProperties } from 'react';

export const COLORES_AVISO_ACTUALIZACION = { fondo: '#00704a', texto: '#ffffff' } as const;

interface Props {
  visible: boolean;
  onActualizar: () => void;
}

const banner: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  background: COLORES_AVISO_ACTUALIZACION.fondo,
  color: COLORES_AVISO_ACTUALIZACION.texto,
  padding: '8px 12px',
  borderRadius: 8,
  margin: '8px 0',
};

const boton: CSSProperties = { minHeight: 44, padding: '8px 16px' };

export function AvisoActualizacion({ visible, onActualizar }: Props) {
  if (!visible) return null;
  return (
    <div role="status" style={banner}>
      <span>Hay una versión nueva de SistemaClima.</span>
      <button style={boton} onClick={onActualizar}>
        Actualizar
      </button>
    </div>
  );
}
