// Banderas de funcionalidad de INGMELEC. Todas apagadas por defecto.
// ACTAS_ENABLED: módulo Acta de Entrega y Asignación (v2.2). Solo el valor exacto
// "true" (sin distinguir mayúsculas) lo activa; cualquier otro valor o su ausencia lo desactiva.
export function isActasEnabled(env = process.env) {
  return String(env?.ACTAS_ENABLED ?? '').trim().toLowerCase() === 'true';
}
