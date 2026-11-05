// ========================================================================
// INGMELEC | ALMACÉN ENTERPRISE - MAPEADOR DE ESTADOS Y PARÁMETROS URL
// ========================================================================

export const STATUS_MAP = {
  BUENO: 'Bueno',
  REGULAR: 'Regular',
  DANADO: 'Dañado',
  FUERA_SERVICIO: 'Fuera de servicio',
  PENDIENTE: 'Pendiente de verificación'
};

/**
 * Convierte un parámetro de la URL (ej: 'BUENO', 'DANADO', 'FUERA_SERVICIO', 'PENDIENTE')
 * al valor exacto en la base de datos MySQL ('Bueno', 'Dañado', etc.)
 */
export function mapParamToEstado(param) {
  if (!param || param === 'TODOS') return 'TODOS';
  const clean = decodeURIComponent(param).trim().toUpperCase().replace(/[-_]/g, ' ');
  if (clean === 'BUENO') return 'Bueno';
  if (clean === 'REGULAR') return 'Regular';
  if (clean === 'DANADO' || clean === 'DAÑADO') return 'Dañado';
  if (clean.includes('FUERA')) return 'Fuera de servicio';
  if (clean.includes('PENDIENTE')) return 'Pendiente de verificación';
  return param;
}

/**
 * Convierte un estado de la base de datos ('Bueno', 'Dañado', etc.)
 * a su código URL estándar ('BUENO', 'DANADO', etc.)
 */
export function mapEstadoToParam(estado) {
  switch (estado) {
    case 'Bueno': return 'BUENO';
    case 'Regular': return 'REGULAR';
    case 'Dañado': return 'DANADO';
    case 'Fuera de servicio': return 'FUERA_SERVICIO';
    case 'Pendiente de verificación': return 'PENDIENTE';
    default: return '';
  }
}
