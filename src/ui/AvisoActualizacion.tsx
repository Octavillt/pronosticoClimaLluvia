import './Avisos.css';

interface Props {
  visible: boolean;
  onActualizar: () => void;
}

export function AvisoActualizacion({ visible, onActualizar }: Props) {
  if (!visible) return null;
  return (
    <div role="status" className="aviso aviso--actualizacion">
      <span>Hay una versión nueva de SistemaClima.</span>
      <button type="button" className="aviso__boton" onClick={onActualizar}>
        Actualizar
      </button>
    </div>
  );
}
