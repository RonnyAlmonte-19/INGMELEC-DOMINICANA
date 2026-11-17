import { isAgotado } from '../../utils/stock';

// Etiqueta roja reutilizando la paleta de insignias existente (bg-rose-100 / text-rose-800).
export default function AgotadoBadge({ articulo, className = '' }) {
  if (!isAgotado(articulo)) return null;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 ${className}`}
      title="Sin existencias disponibles (cantidad = 0)"
    >
      AGOTADO
    </span>
  );
}
