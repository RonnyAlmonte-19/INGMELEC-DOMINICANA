/**
 * Utilidades puras de formateo seguro para renderizado en React (sin dependencias DOM).
 * Previene Minified React Error #31 asegurando que ningún objeto, arreglo o referencia
 * circular llegue directamente al árbol JSX.
 */

/**
 * Convierte de forma determinista cualquier valor JS en una cadena segura para JSX.
 * Nunca devuelve un objeto ni lanza excepciones (incluyendo referencias circulares).
 *
 * @param {*} value
 * @param {string} [fallback='—']
 * @returns {string}
 */
export function toSafeDisplayString(value, fallback = '—') {
  const safeFallback = typeof fallback === 'string' ? fallback : String(fallback ?? '—');

  if (value === null || value === undefined) {
    return safeFallback;
  }

  if (typeof value === 'string') {
    return value.trim() === '' ? safeFallback : value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : safeFallback;
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'symbol' || typeof value === 'function') {
    return safeFallback;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? safeFallback : value.toISOString();
  }

  if (value instanceof Error) {
    return value.message ? String(value.message) : safeFallback;
  }

  try {
    const seen = new WeakSet();
    const serialized = JSON.stringify(value, (_key, val) => {
      if (typeof val === 'bigint') {
        return val.toString();
      }
      if (val !== null && typeof val === 'object') {
        if (seen.has(val)) {
          return '[Circular]';
        }
        seen.add(val);
      }
      return val;
    });

    if (typeof serialized === 'string' && serialized.length > 0) {
      return serialized;
    }
    return safeFallback;
  } catch {
    return safeFallback;
  }
}

/**
 * Parsea de manera segura una cadena JSON. Si ya es objeto/arreglo lo retorna tal cual;
 * si no es un JSON válido o es nulo, devuelve el fallback indicado.
 *
 * @param {*} value
 * @param {*} [fallback=null]
 * @returns {*}
 */
export function parseJsonSafely(value, fallback = null) {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'object') {
    return value;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return fallback;
  }
}

function formatAuditObjectOrArray(data) {
  try {
    if (Array.isArray(data)) {
      if (data.length === 0) return '[]';
      return data.map((item) => toSafeDisplayString(item, '')).filter(Boolean).join(', ');
    }

    const entries = Object.entries(data);
    if (entries.length === 0) return '';

    return entries
      .map(([key, val]) => {
        if (key === 'activo' && (val === 0 || val === 1 || typeof val === 'boolean')) {
          return `activo: ${val === 1 || val === true ? 'Activo (1)' : 'Inactivo (0)'}`;
        }
        if (Array.isArray(val)) {
          const items = val.map((item) => toSafeDisplayString(item, '')).filter(Boolean);
          return items.length > 0 ? `${key}: [${items.join(', ')}]` : `${key}: []`;
        }
        if (val !== null && typeof val === 'object') {
          return `${key}: ${toSafeDisplayString(val, '{}')}`;
        }
        return `${key}: ${toSafeDisplayString(val, '—')}`;
      })
      .join(' · ');
  } catch {
    return toSafeDisplayString(data, '');
  }
}

function formatSingleAuditPayload(raw) {
  if (raw === null || raw === undefined) {
    return '';
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    const parsed = parseJsonSafely(trimmed, null);
    if (parsed !== null && typeof parsed === 'object') {
      return formatAuditObjectOrArray(parsed);
    }
    return trimmed;
  }

  if (typeof raw === 'object') {
    return formatAuditObjectOrArray(raw);
  }

  return toSafeDisplayString(raw, '');
}

/**
 * Formatea detalles de auditoría (nuevos y/o previos) en un texto legible y seguro.
 * Soporta objetos ({ activo: 0 }, { permisos: [...] }), strings JSON o texto plano.
 * Garantiza siempre un retorno de tipo string.
 *
 * @param {*} detallesNuevos
 * @param {*} [detallesPrevios]
 * @param {string} [fallback='-']
 * @returns {string}
 */
export function formatAuditDetails(detallesNuevos, detallesPrevios, fallback = '-') {
  const safeFallback = toSafeDisplayString(fallback, '-');

  try {
    const prevText = formatSingleAuditPayload(detallesPrevios);
    const newText = formatSingleAuditPayload(detallesNuevos);

    if (prevText && newText) {
      return prevText === newText ? newText : `${prevText} → ${newText}`;
    }
    if (newText) {
      return newText;
    }
    if (prevText) {
      return prevText;
    }
    return safeFallback;
  } catch {
    return safeFallback;
  }
}
